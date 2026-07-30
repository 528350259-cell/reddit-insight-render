import type {
  RedditPost,
  RedditPostWithComments,
  ScrapePostParams,
  ScrapeSearchParams,
  ScrapeSubredditParams,
} from '../decodo/decodo.types';

export type ScrapingProvider = 'decodo' | 'reddit-direct';

export interface RedditSource {
  searchReddit(params: ScrapeSearchParams, signal?: AbortSignal): Promise<RedditPost[]>;
  scrapeSubreddit(params: ScrapeSubredditParams, signal?: AbortSignal): Promise<RedditPost[]>;
  scrapePost(params: ScrapePostParams, signal?: AbortSignal): Promise<RedditPostWithComments>;
}
