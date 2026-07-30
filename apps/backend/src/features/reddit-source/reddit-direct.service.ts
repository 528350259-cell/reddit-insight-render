import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type {
  RedditComment,
  RedditPost,
  RedditPostWithComments,
  ScrapePostParams,
  ScrapeSearchParams,
  ScrapeSubredditParams,
} from '../decodo/decodo.types';

function normalizeSubreddit(name: string): string {
  return name.trim().replace(/^\/?r\//i, '');
}

@Injectable()
export class RedditDirectService {
  private readonly logger = new Logger(RedditDirectService.name);
  private readonly headers = {
    'User-Agent': 'codex-reddit-topic-agent/0.1',
    Accept: 'application/json',
  };

  async searchReddit(params: ScrapeSearchParams, signal?: AbortSignal): Promise<RedditPost[]> {
    const { query, timeRange, limit = 25, subreddits } = params;
    const normalizedSubs = subreddits?.map(normalizeSubreddit).filter(Boolean);
    const finalQuery = normalizedSubs?.length
      ? `${query} (${normalizedSubs.map((s) => `subreddit:${s}`).join(' OR ')})`
      : query;

    const encodedQuery = encodeURIComponent(finalQuery);
    const url = `https://www.reddit.com/search.json?q=${encodedQuery}&sort=relevance&t=${timeRange}&limit=${limit}&raw_json=1`;
    const json = await this.fetchJson<{
      data?: { children?: Array<{ data: Record<string, unknown> }> };
    }>(url, signal);

    return this.parsePostListing(json);
  }

  async scrapeSubreddit(
    params: ScrapeSubredditParams,
    signal?: AbortSignal,
  ): Promise<RedditPost[]> {
    const { limit = 25 } = params;
    const subreddit = normalizeSubreddit(params.subreddit);
    const url = `https://www.reddit.com/r/${subreddit}.json?sort=hot&limit=${limit}&raw_json=1`;
    const json = await this.fetchJson<{
      data?: { children?: Array<{ data: Record<string, unknown> }> };
    }>(url, signal);

    return this.parsePostListing(json);
  }

  async scrapePost(
    params: ScrapePostParams,
    signal?: AbortSignal,
  ): Promise<RedditPostWithComments> {
    const subreddit = normalizeSubreddit(params.subreddit);
    const url = `https://www.reddit.com/r/${subreddit}/comments/${params.postId}.json?raw_json=1`;
    const json = await this.fetchJson<
      Array<{
        data?: { children?: Array<{ data: Record<string, unknown> }> };
      }>
    >(url, signal);

    return this.parsePostWithComments(json);
  }

  private async fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    this.logger.log(`Fetching Reddit JSON ${url}`);
    const response = await fetch(url, {
      headers: this.headers,
      signal,
    });

    if (!response.ok) {
      const message =
        response.status === 403
          ? 'Reddit direct fetch failed: 403 Forbidden. Reddit may be blocking unauthenticated JSON access in this environment.'
          : `Reddit direct fetch failed: ${response.status} ${response.statusText}`;
      if (response.status === 429) {
        throw new HttpException(message, 429);
      }
      throw new ServiceUnavailableException(message);
    }

    return (await response.json()) as T;
  }

  private parsePostListing(json: {
    data?: { children?: Array<{ data: Record<string, unknown> }> };
  }): RedditPost[] {
    const children = json?.data?.children ?? [];
    return children.map((child) => this.mapPost(child.data));
  }

  private parsePostWithComments(
    json: Array<{
      data?: { children?: Array<{ data: Record<string, unknown> }> };
    }>,
  ): RedditPostWithComments {
    const [postListing, commentListing] = json;
    const postData = postListing?.data?.children?.[0]?.data ?? {};
    const post = this.mapPost(postData);

    const comments = (commentListing?.data?.children ?? [])
      .filter((c) => c.data?.body)
      .map((c) => this.mapComment(c.data));

    return { ...post, comments };
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
