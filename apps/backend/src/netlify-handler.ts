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

interface NetlifyEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: string | null;
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
      mongoose.models[AnalysisTask.name] ??
      mongoose.model(AnalysisTask.name, AnalysisTaskSchema);

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
    const analysisTaskService = new AnalysisTaskService(
      AnalysisTaskModel as never,
      trackerService,
    );

    return { trackerService, queriesService, settingsService, analysisTaskService };
  })();

  return servicesPromise;
}

function errorResponse(error: unknown): NetlifyResponse {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : (response as { message?: string | string[] }).message ?? error.message;
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

async function dispatchBackgroundTask(event: NetlifyEvent, taskId: string): Promise<void> {
  const response = await fetch(`${getRequestOrigin(event)}/.netlify/functions/analysis-background`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.APP_ACCESS_PASSWORD
        ? { 'x-app-password': process.env.APP_ACCESS_PASSWORD }
        : {}),
    },
    body: JSON.stringify({ taskId }),
  });

  if (!response.ok) {
    throw new Error(`Background task dispatch failed with status ${response.status}`);
  }
}

export async function runAnalysisTask(taskId: string) {
  const { analysisTaskService } = await getServices();
  return analysisTaskService.run(taskId);
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === 'OPTIONS') return empty(204);

  const path = normalizePath(event.path);

  if (path === '/healthz') {
    return json(200, { ok: true, service: 'reddit-insight-netlify-api' });
  }

  if (!isAuthorized(event)) {
    return json(401, { message: '请输入正确的访问口令。' });
  }

  try {
    const { trackerService, queriesService, settingsService, analysisTaskService } =
      await getServices();

    const createTaskMatch = path.match(/^\/tracker\/tasks\/(plan|analyze)$/);
    if (event.httpMethod === 'POST' && createTaskMatch) {
      const kind = createTaskMatch[1] as AnalysisTaskKind;
      const task = await analysisTaskService.create(kind, parseBody(event) as never);
      try {
        await dispatchBackgroundTask(event, task.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await analysisTaskService.fail(task.id, message);
        throw error;
      }
      return json(202, task);
    }

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

    return json(404, { message: `Route not found: ${event.httpMethod} ${path}` });
  } catch (error) {
    return errorResponse(error);
  }
}
