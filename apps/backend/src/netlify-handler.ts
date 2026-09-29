import 'reflect-metadata';
import mongoose from 'mongoose';
import { HttpException } from '@nestjs/common';
import { ConfigService } from './shared/config/config.service';
import { Settings, SettingsSchema } from './features/settings/settings.schema';
import { SettingsService } from './features/settings/settings.service';
import { Query, QuerySchema } from './features/queries/queries.schema';
import { QueriesService } from './features/queries/queries.service';
import { LlmService } from './features/llm/llm.service';
import { DecodoService } from './features/decodo/decodo.service';
import { RedditDirectService } from './features/reddit-source/reddit-direct.service';
import { RedditSourceService } from './features/reddit-source/reddit-source.service';
import { TrackerService } from './features/tracker/tracker.service';
import {
  AnalysisTask,
  AnalysisTaskSchema,
  type AnalysisTaskKind,
} from './features/tracker/analysis-task.schema';
import { AnalysisTaskService } from './features/tracker/analysis-task.service';
import { TikhubService } from './features/tikhub/tikhub.service';
import { TikhubSyncService } from './features/tikhub/tikhub-sync.service';
import {
  TrackedKeywordEntity,
  TrackedKeywordSchema,
} from './features/tikhub/tracked-keyword.schema';
import {
  TikhubSnapshotEntity,
  TikhubSnapshotSchema,
} from './features/tikhub/tikhub-snapshot.schema';
import { DreamInsightService } from './features/dream-insight/dream-insight.service';
import { MarketSignalsService } from './features/market-signals/market-signals.service';

interface NetlifyEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: string | null;
  queryStringParameters?: Record<string, string | undefined> | null;
}

interface NetlifyResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-app-password',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

let servicesPromise: Promise<{
  trackerService: TrackerService;
  queriesService: QueriesService;
  settingsService: SettingsService;
  analysisTaskService: AnalysisTaskService;
  tikhubSyncService: TikhubSyncService;
  marketSignalsService: MarketSignalsService;
}> | null = null;

function json(statusCode: number, body: unknown): NetlifyResponse {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

function empty(statusCode: number): NetlifyResponse {
  return {
    statusCode,
    headers: corsHeaders,
    body: '',
  };
}

function parseBody(event: NetlifyEvent): unknown {
  if (!event.body) return {};
  return JSON.parse(event.body);
}

function normalizePath(path: string): string {
  return path
    .replace(/^\/\.netlify\/functions\/api/i, '')
    .replace(/^\/api/i, '')
    .replace(/\/$/, '');
}

function isAuthorized(event: NetlifyEvent): boolean {
  const expected = process.env.APP_ACCESS_PASSWORD?.trim();
  if (!expected) return true;

  const headerPassword = event.headers['x-app-password']?.trim();
  const authPassword = event.headers.authorization?.replace(/^Bearer\s+/i, '').trim();

  return headerPassword === expected || authPassword === expected;
}

// The weekly GitHub Actions sync job has its own independent credential
// (TIKHUB_SYNC_TOKEN, checked below) and isn't a human visiting the app, so
// it's exempt from the site-wide access password the same way /healthz is.
function isSyncTokenValid(event: NetlifyEvent): boolean {
  const expected = process.env.TIKHUB_SYNC_TOKEN?.trim();
  if (!expected) return false;
  return (event.headers['x-sync-token'] ?? '').trim() === expected;
}

function getEnvConfigService(): ConfigService {
  return new ConfigService({
    get: (key: string, defaultValue?: unknown) => {
      const value = process.env[key];
      return value === undefined || value === '' ? defaultValue : value;
    },
  } as never);
}

async function getServices() {
  if (servicesPromise) return servicesPromise;

  servicesPromise = (async () => {
    const mongodbUri = process.env.MONGODB_URI;
    if (!mongodbUri) {
      throw new Error('MONGODB_URI is not configured');
    }

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongodbUri);
    }

    const SettingsModel =
      mongoose.models[Settings.name] ?? mongoose.model(Settings.name, SettingsSchema);
    const QueryModel = mongoose.models[Query.name] ?? mongoose.model(Query.name, QuerySchema);
    const AnalysisTaskModel =
      mongoose.models[AnalysisTask.name] ?? mongoose.model(AnalysisTask.name, AnalysisTaskSchema);
    const TrackedKeywordModel =
      mongoose.models[TrackedKeywordEntity.name] ??
      mongoose.model(TrackedKeywordEntity.name, TrackedKeywordSchema);
    const TikhubSnapshotModel =
      mongoose.models[TikhubSnapshotEntity.name] ??
      mongoose.model(TikhubSnapshotEntity.name, TikhubSnapshotSchema);

    const configService = getEnvConfigService();
    const settingsService = new SettingsService(SettingsModel as never, configService);
    const llmService = new LlmService(settingsService);
    const decodoService = new DecodoService(settingsService);
    const redditDirectService = new RedditDirectService();
    const redditSourceService = new RedditSourceService(
      settingsService,
      decodoService,
      redditDirectService,
    );
    const queriesService = new QueriesService(QueryModel as never);
    const trackerService = new TrackerService(llmService, redditSourceService, queriesService);
    const analysisTaskService = new AnalysisTaskService(AnalysisTaskModel as never, trackerService);
    const tikhubService = new TikhubService(configService);
    const tikhubSyncService = new TikhubSyncService(
      tikhubService,
      TrackedKeywordModel as never,
      TikhubSnapshotModel as never,
    );
    const dreamInsightService = new DreamInsightService(configService);
    const marketSignalsService = new MarketSignalsService(tikhubSyncService, dreamInsightService);

    return {
      trackerService,
      queriesService,
      settingsService,
      analysisTaskService,
      tikhubSyncService,
      marketSignalsService,
    };
  })();

  return servicesPromise;
}

function errorResponse(error: unknown): NetlifyResponse {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : ((response as { message?: string | string[] }).message ?? error.message);
    return json(error.getStatus(), { message });
  }

  return json(500, {
    message: error instanceof Error ? error.message : String(error),
  });
}

function getRequestOrigin(event: NetlifyEvent): string {
  const configuredOrigin = process.env.NETLIFY_TASK_ORIGIN?.trim();
  if (configuredOrigin) return configuredOrigin.replace(/\/$/, '');

  const host = event.headers['x-forwarded-host'] ?? event.headers.host;
  const protocol = event.headers['x-forwarded-proto'] ?? 'https';
  if (host) return `${protocol}://${host}`;

  const deployUrl = process.env.DEPLOY_PRIME_URL ?? process.env.URL;
  if (!deployUrl) throw new Error('Unable to determine the Netlify deployment URL');
  return deployUrl.replace(/\/$/, '');
}

async function dispatchBackgroundTask(
  event: NetlifyEvent,
  task: {
    taskId: string;
    kind: AnalysisTaskKind;
    payload: unknown;
  },
): Promise<void> {
  const response = await fetch(
    `${getRequestOrigin(event)}/.netlify/functions/analysis-background`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.APP_ACCESS_PASSWORD
          ? { 'x-app-password': process.env.APP_ACCESS_PASSWORD }
          : {}),
      },
      body: JSON.stringify(task),
    },
  );

  if (!response.ok) {
    throw new Error(`Background task dispatch failed with status ${response.status}`);
  }
}

export async function runAnalysisTask(taskId: string) {
  const { analysisTaskService } = await getServices();
  return analysisTaskService.run(taskId);
}

export async function createAndRunAnalysisTask(
  taskId: string,
  kind: AnalysisTaskKind,
  payload: unknown,
) {
  const { analysisTaskService } = await getServices();
  await analysisTaskService.createWithId(taskId, kind, payload as never);
  return analysisTaskService.run(taskId);
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === 'OPTIONS') return empty(204);

  const path = normalizePath(event.path);

  if (path === '/healthz') {
    return json(200, { ok: true, service: 'reddit-insight-netlify-api' });
  }

  // Own credential (X-Sync-Token), not the site-wide access password — the
  // weekly GitHub Actions job calling this doesn't know APP_ACCESS_PASSWORD.
  if (path === '/admin/tikhub/sync' && event.httpMethod === 'POST') {
    if (!isSyncTokenValid(event)) {
      return json(401, { message: 'Invalid or missing X-Sync-Token' });
    }
    try {
      const { tikhubSyncService } = await getServices();
      return json(200, await tikhubSyncService.syncAllTrackedKeywords());
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (!isAuthorized(event)) {
    return json(401, { message: '请输入正确的访问口令。' });
  }

  try {
    const createTaskMatch = path.match(/^\/tracker\/tasks\/(plan|analyze)$/);
    if (event.httpMethod === 'POST' && createTaskMatch) {
      const kind = createTaskMatch[1] as AnalysisTaskKind;
      const payload = parseBody(event);
      const taskId = new mongoose.Types.ObjectId().toString();
      await dispatchBackgroundTask(event, { taskId, kind, payload });
      return json(202, {
        id: taskId,
        kind,
        status: 'queued',
        stage: 'queued',
        progress: {},
      });
    }

    const {
      trackerService,
      queriesService,
      settingsService,
      analysisTaskService,
      tikhubSyncService,
      marketSignalsService,
    } = await getServices();

    const taskMatch = path.match(/^\/tracker\/tasks\/([^/]+)$/);
    if (event.httpMethod === 'GET' && taskMatch) {
      return json(200, await analysisTaskService.findOne(taskMatch[1]));
    }

    if (event.httpMethod === 'POST' && path === '/tracker/plan') {
      return json(200, await trackerService.generatePlan(parseBody(event) as never));
    }

    if (event.httpMethod === 'POST' && path === '/tracker/analyze') {
      return json(200, await trackerService.analyzePlan(parseBody(event) as never));
    }

    if (event.httpMethod === 'GET' && path === '/queries') {
      return json(200, await queriesService.findAll());
    }

    const queryMatch = path.match(/^\/queries\/([^/]+)$/);
    if (queryMatch && event.httpMethod === 'GET') {
      return json(200, await queriesService.findOne(queryMatch[1]));
    }

    if (queryMatch && event.httpMethod === 'DELETE') {
      await queriesService.remove(queryMatch[1]);
      return empty(204);
    }

    if (event.httpMethod === 'GET' && path === '/settings') {
      return json(200, await settingsService.getStatus());
    }

    if (event.httpMethod === 'PATCH' && path === '/settings') {
      return json(200, await settingsService.update(parseBody(event) as never));
    }

    if (event.httpMethod === 'GET' && path === '/tikhub/keywords') {
      return json(200, await tikhubSyncService.listKeywords());
    }

    if (event.httpMethod === 'POST' && path === '/tikhub/keywords') {
      const body = parseBody(event) as { keyword: string; region?: never };
      return json(200, await tikhubSyncService.addKeyword(body.keyword, body.region));
    }

    const keywordDeleteMatch = path.match(/^\/tikhub\/keywords\/([^/]+)$/);
    if (keywordDeleteMatch && event.httpMethod === 'DELETE') {
      await tikhubSyncService.removeKeyword(keywordDeleteMatch[1]);
      return empty(204);
    }

    if (event.httpMethod === 'GET' && path === '/market-signals') {
      const keyword = event.queryStringParameters?.keyword?.trim();
      if (!keyword) {
        return json(400, { message: 'Query param "keyword" is required' });
      }
      return json(200, await marketSignalsService.getSignals(keyword));
    }

    return json(404, { message: `Route not found: ${event.httpMethod} ${path}` });
  } catch (error) {
    return errorResponse(error);
  }
}
