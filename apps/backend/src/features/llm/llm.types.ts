export type LlmProvider = 'claude' | 'openai' | 'gemini' | 'deepseek';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  /** Override the provider for this request */
  provider?: LlmProvider;
  /** Override the model for this request */
  model?: string;
  /** Response format hint — 'json' instructs the LLM to return valid JSON */
  responseFormat?: 'text' | 'json';
}

export interface LlmResponse {
  content: string;
  provider: LlmProvider;
  model: string;
}

export interface ScrapingPlan {
  subreddits: string[];
  queries: string[];
  timeRange: 'day' | 'week' | 'month' | 'year';
  rationale: string;
}

export interface RedditReport {
  executiveSummary: string;
  frequentTerms: Array<{ term: string; count: number; context: string }>;
  termGlossary: Array<{ term: string; explanationZh: string; context?: string }>;
  painPoints: string[];
  comfortPoints: string[];
  topDiscussionThreads: Array<{
    postTitle: string;
    subreddit: string;
    postUrl: string;
    parentComment: {
      author: string;
      text: string;
      upvotes: number;
    };
    replies: Array<{
      author: string;
      text: string;
      upvotes: number;
      permalink: string;
    }>;
  }>;
  themes: Array<{ title: string; description: string }>;
  sentiment: {
    overall: 'positive' | 'negative' | 'neutral' | 'mixed';
    rationale: string;
  };
  notableQuotes: Array<{ text: string; subreddit: string; url: string }>;
  topPosts: Array<{
    title: string;
    subreddit: string;
    upvotes: number;
    commentCount: number;
    url: string;
  }>;
}
