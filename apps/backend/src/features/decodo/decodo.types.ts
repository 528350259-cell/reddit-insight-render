export type DecodoTarget = 'universal' | 'reddit_subreddit' | 'reddit_post' | 'google_search';

export interface DecodoScrapeRequest {
  target: DecodoTarget;
  /** Required for reddit/universal targets */
  url?: string;
  /** Required for the google_search target — mutually exclusive with `url` */
  query?: string;
  /** google_search only: request Decodo's structured/parsed SERP JSON */
  parse?: boolean;
  locale?: string;
}

export interface DecodoScrapeResponse {
  status: number;
  url: string;
  content: unknown;
  target: DecodoTarget;
}

export type RedditTimeRange = 'day' | 'week' | 'month' | 'year';

export interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  author: string;
  upvotes: number;
  commentCount: number;
  url: string;
  permalink: string;
  selftext: string;
  createdAt: number;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  upvotes: number;
  permalink: string;
  replies?: RedditComment[];
}

export interface RedditPostWithComments extends RedditPost {
  comments: RedditComment[];
}

export interface ScrapeSearchParams {
  query: string;
  timeRange: RedditTimeRange;
  limit?: number;
  /** Restrict search to these subreddits via Reddit's `subreddit:` operator */
  subreddits?: string[];
}

export interface ScrapeSubredditParams {
  subreddit: string;
  limit?: number;
}

export interface ScrapePostParams {
  subreddit: string;
  postId: string;
}

// ---------------------------------------------------------------------------
// Google-search-assisted discovery (Decodo `google_search` target)
// ---------------------------------------------------------------------------

/** One organic result from Decodo's parsed Google SERP output. */
export interface GoogleOrganicResult {
  pos: number;
  pos_overall?: number;
  title: string;
  url: string;
  desc?: string;
  url_shown?: string;
}

/** A Reddit post identified from a Google search result, before hydration. */
export interface GoogleDiscoveredPost {
  subreddit: string;
  postId: string;
}
