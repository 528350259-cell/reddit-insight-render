import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import type {
  DecodoScrapeRequest,
  DecodoScrapeResponse,
  DecodoTarget,
  RedditPost,
  RedditComment,
  RedditPostWithComments,
  ScrapeSearchParams,
  ScrapeSubredditParams,
  ScrapePostParams,
  GoogleOrganicResult,
  GoogleDiscoveredPost,
} from './decodo.types';

// Matches Reddit post permalinks embedded in a Google result URL, e.g.
// https://www.reddit.com/r/headphones/comments/1kp55ia/some_title/
const REDDIT_PERMALINK_RE = /reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)\//i;

// Strips "/r/", "r/", and surrounding whitespace from a subreddit name.
// LLM plan output occasionally includes the "r/" prefix; without this,
// URLs like /r/r/foo.json end up 404ing.
function normalizeSubreddit(name: string): string {
  return name.trim().replace(/^\/?r\//i, '');
}

@Injectable()
export class DecodoService {
  private readonly logger = new Logger(DecodoService.name);

  constructor(private readonly settingsService: SettingsService) {}

  // ---------------------------------------------------------------------------
  // Core Decodo API call
  // ---------------------------------------------------------------------------

  async scrape(request: DecodoScrapeRequest, signal?: AbortSignal): Promise<DecodoScrapeResponse> {
    const config = await this.settingsService.getEffectiveConfig();
    const { decodoApiKey } = config;

    if (!decodoApiKey) {
      throw new BadRequestException('DECODO_BASIC_AUTH_TOKEN is not configured');
    }

    this.logger.log(`Scraping [${request.target}] ${request.url ?? request.query}`);

    // The google_search target takes `query` (+ optional `parse`) instead of
    // `url`/`locale` — sending both shapes together gets rejected with a 400,
    // so build the body based on which one this request actually uses.
    const body =
      request.query !== undefined
        ? { target: request.target, query: request.query, parse: request.parse }
        : { target: request.target, url: request.url, locale: request.locale ?? 'en' };

    const response = await fetch('https://scraper-api.decodo.com/v2/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${decodoApiKey}`,
        'x-integration': 'reddit_tracker',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const message = `Decodo API error: ${response.status} ${response.statusText}`;
      // Preserve 429 so callers can distinguish rate-limiting from other failures
      // and surface a more accurate error to the user.
      if (response.status === 429) {
        throw new HttpException(message, 429);
      }
      throw new ServiceUnavailableException(message);
    }

    // Decodo v2 response: { results: [{ content, status_code, ... }] }
    const raw = (await response.json()) as Record<string, unknown>;
    const results = raw['results'] as Array<{ content: string; status_code: number }> | undefined;
    const first = results?.[0];

    if (!first) {
      this.logger.warn(
        `[Decodo] Unexpected response shape (keys: ${Object.keys(raw).join(', ')}): ` +
          JSON.stringify(raw).slice(0, 300),
      );
      throw new ServiceUnavailableException('Decodo API returned unexpected response structure');
    }

    const contentType = typeof first.content;
    const contentPreview =
      contentType === 'string'
        ? `${(first.content as string).length} chars`
        : `[${contentType}] ${JSON.stringify(first.content).slice(0, 120)}`;

    this.logger.log(
      `[Decodo] ✓ ${request.target} status=${first.status_code} content=${contentPreview}`,
    );

    return {
      status: first.status_code,
      url: request.url ?? request.query ?? '',
      content: first.content as unknown,
      target: request.target,
    };
  }

  // ---------------------------------------------------------------------------
  // Target: universal — global Reddit search
  // ---------------------------------------------------------------------------

  async searchReddit(params: ScrapeSearchParams, signal?: AbortSignal): Promise<RedditPost[]> {
    const { query, timeRange, limit = 25, subreddits } = params;

    // When subreddits are provided, use Reddit's `subreddit:` operator to scope
    // the search. Without this, "react" matches r/AITAH/r/cats posts that
    // happen to contain "react"/"reacts"/"reaction" — viral drama drowns out
    // actual programming discussion.
    const normalizedSubs = subreddits?.map(normalizeSubreddit).filter(Boolean);
    const finalQuery = normalizedSubs?.length
      ? `${query} (${normalizedSubs.map((s) => `subreddit:${s}`).join(' OR ')})`
      : query;

    const encodedQuery = encodeURIComponent(finalQuery);
    const url = `https://www.reddit.com/search.json?q=${encodedQuery}&sort=relevance&t=${timeRange}&limit=${limit}`;

    const result = await this.scrape({ target: 'universal', url }, signal);
    return this.parsePostListing(result.content as string | object, 'universal');
  }

  // ---------------------------------------------------------------------------
  // Target: reddit_subreddit — subreddit feed
  // ---------------------------------------------------------------------------

  async scrapeSubreddit(
    params: ScrapeSubredditParams,
    signal?: AbortSignal,
  ): Promise<RedditPost[]> {
    const { limit = 25 } = params;
    const subreddit = normalizeSubreddit(params.subreddit);
    const url = `https://www.reddit.com/r/${subreddit}.json?sort=hot&limit=${limit}`;

    const result = await this.scrape({ target: 'reddit_subreddit', url }, signal);
    return this.parsePostListing(result.content as string | object, 'reddit_subreddit');
  }

  // ---------------------------------------------------------------------------
  // Target: reddit_post — full comment thread
  // ---------------------------------------------------------------------------

  async scrapePost(
    params: ScrapePostParams,
    signal?: AbortSignal,
  ): Promise<RedditPostWithComments> {
    const { postId } = params;
    const subreddit = normalizeSubreddit(params.subreddit);
    const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json`;

    // Use universal target: reddit_post returns 404 for .json URLs;
    // universal fetches the raw JSON string which our parser already handles correctly.
    const result = await this.scrape({ target: 'universal', url }, signal);

    if (result.status !== 200) {
      this.logger.warn(`[scrapePost] Skipping post ${postId} — status ${result.status}`);
      return {
        id: postId,
        title: '',
        subreddit,
        author: '',
        upvotes: 0,
        commentCount: 0,
        url,
        permalink: '',
        selftext: '',
        createdAt: 0,
        comments: [],
      };
    }

    return this.parsePostWithComments(result.content as string | object);
  }

  // ---------------------------------------------------------------------------
  // Target: google_search — discover Reddit threads Reddit's own search misses
  // ---------------------------------------------------------------------------
  //
  // Reddit's native search.json ranks poorly on broad/generic prompts. Google
  // ranks Reddit content well by default (no advanced operator needed) — in
  // fact appending a `site:reddit.com` filter to the query breaks this target
  // (Google silently drops it and returns unrelated results), so we mimic
  // what a human actually types: "<query> reddit".

  async searchGoogleForReddit(
    query: string,
    limit = 8,
    signal?: AbortSignal,
  ): Promise<GoogleDiscoveredPost[]> {
    const result = await this.scrape(
      { target: 'google_search', query: `${query} reddit`, parse: true },
      signal,
    );

    const organic = this.extractOrganicResults(result.content);
    if (organic.length === 0) {
      this.logger.warn(`[GoogleDiscovery] No organic results for "${query}"`);
      return [];
    }

    const seen = new Set<string>();
    const discovered: GoogleDiscoveredPost[] = [];

    for (const item of organic) {
      const match = REDDIT_PERMALINK_RE.exec(item.url ?? '');
      if (!match) continue;
      const [, subreddit, postId] = match;
      if (seen.has(postId)) continue;
      seen.add(postId);
      discovered.push({ subreddit, postId });
      if (discovered.length >= limit) break;
    }

    this.logger.log(
      `[GoogleDiscovery] "${query}" → ${organic.length} organic results, ${discovered.length} Reddit threads`,
    );

    return discovered;
  }

  // google_search's `parse: true` response double-nests organic results:
  // content.results.results.organic (the outer "results" wraps pagination
  // metadata like last_visible_page/page; the inner "results" is the actual
  // SERP payload with organic/navigation/paid/etc). Re-verified against a
  // live Decodo response on 2026-09-08 — a single-level content.results.organic
  // silently returns nothing, which is exactly the kind of bug unit tests
  // built on a guessed mock shape won't catch.
  private extractOrganicResults(content: unknown): GoogleOrganicResult[] {
    try {
      const parsed = this.parseContent<{
        results?: { results?: { organic?: GoogleOrganicResult[] } };
      }>(content as string | object);
      return parsed?.results?.results?.organic ?? [];
    } catch (err) {
      this.logger.warn(`Failed to parse google_search response: ${String(err)}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Parsers
  // ---------------------------------------------------------------------------

  private parseContent<T>(content: string | object): T {
    if (typeof content === 'string') {
      return JSON.parse(content) as T;
    }
    return content as T;
  }

  private parsePostListing(content: string | object, _target: DecodoTarget): RedditPost[] {
    try {
      const json = this.parseContent<{
        data?: {
          children?: Array<{ data: Record<string, unknown> }>;
        };
      }>(content);

      const children = json?.data?.children ?? [];
      this.logger.log(`[Parser] parsePostListing found ${children.length} children`);
      return children.map((child) => this.mapPost(child.data));
    } catch (err) {
      this.logger.warn(`Failed to parse post listing: ${String(err)}`);
      return [];
    }
  }

  private parsePostWithComments(content: string | object): RedditPostWithComments {
    try {
      const json = this.parseContent<
        Array<{
          data?: { children?: Array<{ data: Record<string, unknown> }> };
        }>
      >(content);

      const [postListing, commentListing] = json;
      const postData = postListing?.data?.children?.[0]?.data ?? {};
      const post = this.mapPost(postData);

      const comments = (commentListing?.data?.children ?? [])
        .filter((c) => c.data?.body)
        .map((c) => this.mapComment(c.data));

      return { ...post, comments };
    } catch (err) {
      this.logger.warn(`Failed to parse post with comments: ${String(err)}`);
      return {
        id: '',
        title: '',
        subreddit: '',
        author: '',
        upvotes: 0,
        commentCount: 0,
        url: '',
        permalink: '',
        selftext: '',
        createdAt: 0,
        comments: [],
      };
    }
  }

  private mapPost(data: Record<string, unknown>): RedditPost {
    const permalink = String(data['permalink'] ?? '');
    return {
      id: String(data['id'] ?? ''),
      title: String(data['title'] ?? ''),
      subreddit: String(data['subreddit'] ?? ''),
      author: String(data['author'] ?? ''),
      upvotes: Number(data['ups'] ?? 0),
      commentCount: Number(data['num_comments'] ?? 0),
      url: String(data['url'] ?? ''),
      permalink,
      selftext: String(data['selftext'] ?? ''),
      createdAt: Number(data['created_utc'] ?? 0),
    };
  }

  private mapComment(data: Record<string, unknown>): RedditComment {
    const replies = this.extractReplies(data['replies']);
    return {
      id: String(data['id'] ?? ''),
      author: String(data['author'] ?? ''),
      body: String(data['body'] ?? ''),
      upvotes: Number(data['ups'] ?? 0),
      permalink: String(data['permalink'] ?? ''),
      replies,
    };
  }

  private extractReplies(replies: unknown): RedditComment[] {
    if (!replies || typeof replies !== 'object') return [];

    const listing = replies as {
      data?: { children?: Array<{ data: Record<string, unknown> }> };
    };

    return (listing.data?.children ?? [])
      .filter((child) => child.data?.body)
      .map((child) => this.mapComment(child.data));
  }
}
