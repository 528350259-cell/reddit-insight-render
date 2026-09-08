import { HttpException, Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { QueriesService } from '../queries/queries.service';
import { SCRAPING_PLAN_PROMPT, SUMMARIZATION_PROMPT } from '../llm/llm.constants';
import type { ScrapingPlan, RedditReport } from '../llm/llm.types';
import type { RedditPost, RedditPostWithComments } from '../decodo/decodo.types';
import type { GeneratePlanDto } from './dto/generate-plan.dto';
import type { AnalyzePlanDto } from './dto/analyze-plan.dto';
import { RedditSourceService } from '../reddit-source/reddit-source.service';

const MAX_POSTS_TOTAL = 16;
const MAX_POSTS_DEEP_DIVE = 7;
const SCRAPE_CONCURRENCY = 4; // max simultaneous Decodo requests to avoid 429s
const MAX_POST_BODY_CHARS = 400;
const MAX_COMMENT_CHARS = 240;
const MAX_COMMENTS_PER_POST = 5;

// LLM plan output sometimes wraps subreddit names with "r/" — normalize so
// downstream URLs and `subreddit:` search clauses don't end up malformed.
function normalizeSubreddit(name: string): string {
  return name.trim().replace(/^\/?r\//i, '');
}

// Small stop-word filter for tokenization. Keep it minimal — we want to drop
// noise like "the"/"are"/"what" while preserving short topical tokens like "ai".
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'from',
  'by',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'am',
  'do',
  'does',
  'did',
  'has',
  'have',
  'had',
  'will',
  'would',
  'should',
  'can',
  'could',
  'may',
  'might',
  'must',
  'what',
  'when',
  'where',
  'why',
  'who',
  'which',
  'how',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'they',
  'them',
  'their',
  'i',
  'you',
  'he',
  'she',
  'we',
  'us',
  'our',
  'your',
  'about',
  'if',
  'than',
  'then',
  'so',
  'not',
  'no',
  'yes',
  'too',
  'very',
  'just',
]);

function tokenize(text: string): Set<string> {
  const matches = text.toLowerCase().match(/\b[a-z0-9]{2,}\b/g) ?? [];
  return new Set(matches.filter((w) => !STOP_WORDS.has(w)));
}

function containsCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function shouldSearchVerbatimPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;
  if (containsCjk(trimmed)) return false;
  return /[a-zA-Z]/.test(trimmed);
}

// Returns a 0..1 score for how much of the prompt's tokens appear in the post.
function relevance(promptTokens: Set<string>, post: RedditPost): number {
  if (promptTokens.size === 0) return 0;
  const postTokens = tokenize(`${post.title} ${post.selftext}`);
  let hits = 0;
  for (const tok of promptTokens) {
    if (postTokens.has(tok)) hits++;
  }
  return hits / promptTokens.size;
}

// ---------------------------------------------------------------------------
// Progress streaming types
// ---------------------------------------------------------------------------

export type ProgressEvent =
  | { type: 'started'; totalTasks: number; queries: number; subreddits: number }
  | { type: 'task_complete'; completed: number; total: number; label: string }
  | { type: 'deep_diving'; posts: number }
  | { type: 'summarizing' }
  | { type: 'saving' };

export type OnProgress = (event: ProgressEvent) => void;

@Injectable()
export class TrackerService {
  private readonly logger = new Logger(TrackerService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly redditSourceService: RedditSourceService,
    private readonly queriesService: QueriesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Endpoint 1: generate a scraping plan from a natural language prompt
  // ---------------------------------------------------------------------------

  async generatePlan(dto: GeneratePlanDto): Promise<ScrapingPlan> {
    this.logger.log(`[Plan] ▶ Generating plan for: "${dto.prompt}"`);
    const t0 = Date.now();

    const userMessage = [
      `User prompt: "${dto.prompt}"`,
      containsCjk(dto.prompt)
        ? 'The user asked in Chinese or mixed Chinese. Translate the research intent into natural English Reddit language before choosing search queries.'
        : '',
      dto.subreddits?.length
        ? `User-specified subreddits (must include these): ${dto.subreddits.join(', ')}`
        : '',
      dto.timeRange ? `User-specified time range: ${dto.timeRange}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.llmService.complete({
      messages: [
        { role: 'user', content: SCRAPING_PLAN_PROMPT },
        { role: 'user', content: userMessage },
      ],
      responseFormat: 'json',
    });

    const plan = this.llmService.parseJsonResponse<ScrapingPlan>(response.content);

    // Normalize LLM output — strip any stray "r/" prefixes the model may include.
    plan.subreddits = plan.subreddits.map(normalizeSubreddit).filter(Boolean);
    plan.queries = plan.queries.map((query) => query.trim()).filter(Boolean);

    if (containsCjk(dto.prompt)) {
      plan.queries = plan.queries.filter((query) => !containsCjk(query));
    }

    // Honour any user overrides
    if (dto.subreddits?.length) {
      const userSubs = dto.subreddits.map((s) => normalizeSubreddit(s).toLowerCase());
      const merged = [...new Set([...userSubs, ...plan.subreddits])];
      plan.subreddits = merged;
    }

    if (dto.timeRange) {
      plan.timeRange = dto.timeRange;
    }

    if (plan.queries.length === 0) {
      plan.queries = [dto.prompt.trim()];
    }

    this.logger.log(
      `[Plan] ✓ Done in ${Date.now() - t0}ms — ` +
        `subreddits: [${plan.subreddits.join(', ')}] ` +
        `queries: ${plan.queries.length} ` +
        `timeRange: ${plan.timeRange}`,
    );
    this.logger.log(`[Plan] Rationale: ${plan.rationale}`);

    return plan;
  }

  // ---------------------------------------------------------------------------
  // Endpoint 2: execute the plan and return a summarized report
  // ---------------------------------------------------------------------------

  async analyzePlan(
    dto: AnalyzePlanDto,
    onProgress?: OnProgress,
    signal?: AbortSignal,
  ): Promise<{
    id: string;
    plan: AnalyzePlanDto;
    posts: RedditPost[];
    report: RedditReport;
  }> {
    const tTotal = Date.now();
    this.logger.log(
      `[Analyze] ▶ Starting — subreddits: [${dto.subreddits.join(', ')}] | queries: [${dto.queries.join(', ')}] | timeRange: ${dto.timeRange}`,
    );

    // Step 1: parallel scraping (concurrency-capped)
    this.logger.log(
      `[Analyze] Step 1/4 — Scraping (${dto.queries.length} searches + ${dto.subreddits.length} subreddit feeds, max ${SCRAPE_CONCURRENCY} concurrent)...`,
    );
    const t1 = Date.now();
    const { posts, searchPostIds, failures, googleHydrated } = await this.scrapeAll(
      dto,
      onProgress,
      signal,
    );
    this.logger.log(
      `[Analyze] Step 1/4 ✓ — ${posts.length} posts collected in ${Date.now() - t1}ms`,
    );

    if (signal?.aborted) throw new Error('Request was cancelled');

    // If scraping produced nothing, bail before wasting LLM tokens and saving a
    // useless empty report to history. Distinguish rate-limit, total-failure,
    // and "Reddit returned nothing" so the user gets an actionable message.
    if (posts.length === 0) {
      if (failures.length > 0) {
        const had429 = failures.some((e) => e instanceof HttpException && e.getStatus() === 429);
        if (had429) {
          throw new HttpException(
            'Decodo rate limit reached. Please wait a moment and try again.',
            429,
          );
        }
        throw new HttpException(
          'Reddit scraping failed for all targets. The Decodo service may be unavailable.',
          502,
        );
      }
      throw new HttpException(
        'No Reddit posts matched your query. Try broadening the subreddits or time range.',
        404,
      );
    }

    // Step 2: deep-dive comment threads — prefer search results (topically relevant)
    // over subreddit hot posts (high upvotes but often off-topic)
    const searchPosts = posts.filter((p) => searchPostIds.has(p.id));
    const deepDiveCandidates = searchPosts.length > 0 ? searchPosts : posts;
    const deepDivePosts = deepDiveCandidates.slice(0, MAX_POSTS_DEEP_DIVE);
    this.logger.log(
      `[Analyze] Step 2/4 — Deep-diving ${deepDivePosts.length} top posts for comments...`,
    );
    onProgress?.({ type: 'deep_diving', posts: deepDivePosts.length });
    const t2 = Date.now();
    const postsWithComments = await this.deepDive(deepDivePosts, googleHydrated, signal);
    const totalComments = postsWithComments.reduce((n, p) => n + p.comments.length, 0);
    this.logger.log(
      `[Analyze] Step 2/4 ✓ — ${totalComments} comments fetched in ${Date.now() - t2}ms`,
    );

    if (signal?.aborted) throw new Error('Request was cancelled');

    // Step 3: LLM summarization
    this.logger.log(
      `[Analyze] Step 3/4 — Sending ${posts.length} posts to LLM for summarization...`,
    );
    onProgress?.({ type: 'summarizing' });
    const t3 = Date.now();
    const report = await this.summarize(dto.prompt, posts, postsWithComments, signal);
    this.logger.log(`[Analyze] Step 3/4 ✓ — Report generated in ${Date.now() - t3}ms`);
    this.logger.log(
      `[Analyze] Report sentiment: ${report.sentiment.overall} | themes: ${report.themes.map((t) => t.title).join(', ')}`,
    );

    // Step 4: persist to query history
    this.logger.log(`[Analyze] Step 4/4 — Persisting to MongoDB...`);
    onProgress?.({ type: 'saving' });
    const saved = await this.queriesService.create({
      prompt: dto.prompt,
      plan: {
        subreddits: dto.subreddits,
        queries: dto.queries,
        timeRange: dto.timeRange,
        rationale: '',
      },
      posts,
      report,
    });
    this.logger.log(`[Analyze] Step 4/4 ✓ — Saved as query ID: ${String(saved._id)}`);

    this.logger.log(`[Analyze] ✓ Complete in ${Date.now() - tTotal}ms`);

    return { id: String(saved._id), plan: dto, posts, report };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async scrapeAll(
    dto: AnalyzePlanDto,
    onProgress?: OnProgress,
    signal?: AbortSignal,
  ): Promise<{
    posts: RedditPost[];
    searchPostIds: Set<string>;
    failures: Error[];
    googleHydrated: Map<string, RedditPostWithComments>;
  }> {
    // Always search the verbatim prompt — LLM-generated queries may paraphrase it
    const seedQueries = shouldSearchVerbatimPrompt(dto.prompt) ? [dto.prompt] : [];
    const allQueries = [...new Set([...seedQueries, ...dto.queries])];

    // Reddit's own search ranks broad/generic prompts poorly. Supplement with
    // one Google-assisted discovery pass on the primary query only (not every
    // LLM sub-query) to keep the extra Decodo cost small.
    const googleQuery = seedQueries[0] ?? dto.queries[0];
    const googleHydrated = new Map<string, RedditPostWithComments>();

    const totalTasks = allQueries.length + dto.subreddits.length + (googleQuery ? 1 : 0);
    let completedTasks = 0;
    const failures: Error[] = [];

    onProgress?.({
      type: 'started',
      totalTasks,
      queries: allQueries.length,
      subreddits: dto.subreddits.length,
    });

    const searchTasks: (() => Promise<RedditPost[]>)[] = allQueries.map(
      (query, index) => async () => {
        // When the first query is the original verbatim prompt, search a wider window to catch older niche content.
        const timeRange =
          seedQueries.length > 0 && index === 0 && query === dto.prompt ? 'year' : dto.timeRange;
        const result = await this.redditSourceService
          .searchReddit({ query, timeRange, subreddits: dto.subreddits }, signal)
          .catch((err: unknown) => {
            if ((err as Error)?.name === 'AbortError') throw err;
            this.logger.warn(`Search query failed for "${query}": ${String(err)}`);
            failures.push(err as Error);
            return [] as RedditPost[];
          });
        onProgress?.({
          type: 'task_complete',
          completed: ++completedTasks,
          total: totalTasks,
          label: `search: "${query}"`,
        });
        return result;
      },
    );

    const subredditTasks: (() => Promise<RedditPost[]>)[] = dto.subreddits.map(
      (subreddit) => async () => {
        const result = await this.redditSourceService
          .scrapeSubreddit({ subreddit }, signal)
          .catch((err: unknown) => {
            if ((err as Error)?.name === 'AbortError') throw err;
            this.logger.warn(`Subreddit scrape failed for r/${subreddit}: ${String(err)}`);
            failures.push(err as Error);
            return [] as RedditPost[];
          });
        onProgress?.({
          type: 'task_complete',
          completed: ++completedTasks,
          total: totalTasks,
          label: `r/${subreddit}`,
        });
        return result;
      },
    );

    // Google discovery returns full RedditPostWithComments (scrapePost already
    // fetches comments) — stash them so deepDive can reuse instead of re-fetching.
    const googleTasks: (() => Promise<RedditPost[]>)[] = googleQuery
      ? [
          async () => {
            const found = await this.redditSourceService
              .discoverViaGoogle(googleQuery, 8, signal)
              .catch((err: unknown) => {
                if ((err as Error)?.name === 'AbortError') throw err;
                this.logger.warn(`Google discovery failed for "${googleQuery}": ${String(err)}`);
                failures.push(err as Error);
                return [];
              });

            const hydrated = await Promise.all(
              found.map(({ subreddit, postId }) =>
                this.redditSourceService
                  .scrapePost({ subreddit, postId }, signal)
                  .catch((err: unknown) => {
                    if ((err as Error)?.name === 'AbortError') throw err;
                    this.logger.warn(`Google-discovered post ${postId} failed: ${String(err)}`);
                    return null;
                  }),
              ),
            );

            const posts: RedditPost[] = [];
            for (const post of hydrated) {
              if (!post?.id) continue;
              googleHydrated.set(post.id, post);
              posts.push(post);
            }

            onProgress?.({
              type: 'task_complete',
              completed: ++completedTasks,
              total: totalTasks,
              label: `google: "${googleQuery}"`,
            });
            return posts;
          },
        ]
      : [];

    const allTasks = [...searchTasks, ...subredditTasks, ...googleTasks];
    const results = await TrackerService.runWithConcurrency(allTasks, SCRAPE_CONCURRENCY);

    const searchResults = results.slice(0, allQueries.length).flat();
    const subredditResults = results
      .slice(allQueries.length, allQueries.length + dto.subreddits.length)
      .flat();
    const googleResults = results.slice(allQueries.length + dto.subreddits.length).flat();

    // IDs of search-result posts — used to prioritize deep-dive selection.
    // Google-discovered posts count as "search" too: they're topically found,
    // not just high-upvote noise from a subreddit's hot feed.
    const searchPostIds = new Set(
      [...searchResults, ...googleResults].map((p) => p.id).filter(Boolean),
    );

    const all = [...searchResults, ...subredditResults, ...googleResults];
    const ranked = this.deduplicateAndRank(all, dto.prompt, dto.subreddits).slice(
      0,
      Math.min(dto.maxPosts ?? MAX_POSTS_TOTAL, MAX_POSTS_TOTAL),
    );

    this.logger.log(
      `[Scrape] Search: ${searchResults.length} | Subreddits: ${subredditResults.length} | ` +
        `Google: ${googleResults.length} → dedup+rank: ${ranked.length} ` +
        `(top: "${ranked[0]?.title?.slice(0, 60) ?? 'none'}")`,
    );

    return { posts: ranked, searchPostIds, failures, googleHydrated };
  }

  // Runs tasks with at most `concurrency` in-flight at a time to avoid 429s
  private static async runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number,
  ): Promise<T[]> {
    const results: T[] = new Array(tasks.length) as T[];
    let next = 0;

    const worker = async (): Promise<void> => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]();
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  private async deepDive(
    posts: RedditPost[],
    hydrated: Map<string, RedditPostWithComments>,
    signal?: AbortSignal,
  ): Promise<RedditPostWithComments[]> {
    const tasks = posts.map((post) => {
      // Google discovery already fetched this post's comments in Step 1 — reuse it.
      const cached = hydrated.get(post.id);
      if (cached) return Promise.resolve(cached);

      return this.redditSourceService
        .scrapePost({ subreddit: post.subreddit, postId: post.id }, signal)
        .catch((err: unknown) => {
          if ((err as Error)?.name === 'AbortError') throw err;
          this.logger.warn(`Comment scrape failed for post ${post.id}: ${String(err)}`);
          return { ...post, comments: [] };
        });
    });

    return Promise.all(tasks);
  }

  private async summarize(
    prompt: string,
    posts: RedditPost[],
    postsWithComments: RedditPostWithComments[],
    signal?: AbortSignal,
  ): Promise<RedditReport> {
    const contentSummary = this.buildContentSummary(posts, postsWithComments);

    const userMessage = [
      `Research prompt: "${prompt}"`,
      '',
      'Scraped Reddit content:',
      contentSummary,
    ].join('\n');

    const response = await this.llmService.complete(
      {
        messages: [
          { role: 'user', content: SUMMARIZATION_PROMPT },
          { role: 'user', content: userMessage },
        ],
        responseFormat: 'json',
      },
      signal,
    );

    const parsed = this.llmService.parseJsonResponse<RedditReport>(response.content);
    return {
      ...parsed,
      frequentTerms: parsed.frequentTerms ?? [],
      termGlossary: parsed.termGlossary ?? [],
      painPoints: parsed.painPoints ?? [],
      comfortPoints: parsed.comfortPoints ?? [],
      topDiscussionThreads: this.buildTopDiscussionThreads(postsWithComments),
      themes: parsed.themes ?? [],
      notableQuotes: parsed.notableQuotes ?? [],
      topPosts: parsed.topPosts ?? [],
    };
  }

  private buildContentSummary(
    posts: RedditPost[],
    postsWithComments: RedditPostWithComments[],
  ): string {
    const commentMap = new Map(postsWithComments.map((p) => [p.id, p]));

    return posts
      .map((post) => {
        const withComments = commentMap.get(post.id);
        const lines = [
          `POST: ${post.title}`,
          `Subreddit: r/${post.subreddit} | Upvotes: ${post.upvotes} | Comments: ${post.commentCount}`,
          `URL: https://www.reddit.com${post.permalink}`,
          post.selftext ? `Body: ${post.selftext.slice(0, MAX_POST_BODY_CHARS)}` : '',
        ];

        if (withComments?.comments.length) {
          const usefulComments = withComments.comments.filter((c) => this.isUsefulComment(c.body));
          lines.push(
            'Top comments:',
            ...usefulComments
              .slice(0, MAX_COMMENTS_PER_POST)
              .map((c) => `  - [${c.upvotes} upvotes] ${c.body.slice(0, MAX_COMMENT_CHARS)}`),
          );
        }

        return lines.filter(Boolean).join('\n');
      })
      .join('\n\n---\n\n');
  }

  private deduplicateAndRank(
    posts: RedditPost[],
    prompt: string,
    planSubreddits: string[] = [],
  ): RedditPost[] {
    const seen = new Set<string>();
    const unique: RedditPost[] = [];

    for (const post of posts) {
      if (post.id && !seen.has(post.id)) {
        seen.add(post.id);
        unique.push(post);
      }
    }

    // Filter to plan subreddits when provided. Reddit's site-wide search can
    // bleed in unrelated communities (e.g. r/AITAH/r/cats matching "react") —
    // dropping off-plan posts prevents viral drama from dominating. If the
    // filter eliminates everything, fall back to the unfiltered list rather
    // than returning nothing.
    let filtered = unique;
    if (planSubreddits.length > 0) {
      const planSet = new Set(planSubreddits.map((s) => s.toLowerCase()));
      const onPlan = unique.filter((p) => planSet.has(p.subreddit.toLowerCase()));
      const dropped = unique.length - onPlan.length;
      if (dropped > 0) {
        this.logger.log(`[Rank] Dropped ${dropped} off-plan posts (kept ${onPlan.length})`);
      }
      filtered = onPlan.length > 0 ? onPlan : unique;
    }

    const promptTokens = tokenize(prompt);
    const relevanceMap = new Map(filtered.map((p) => [p.id, relevance(promptTokens, p)]));

    return filtered.sort((a, b) => {
      const relA = relevanceMap.get(a.id) ?? 0;
      const relB = relevanceMap.get(b.id) ?? 0;
      // Off-topic posts penalised (× 0.2), on-topic posts get full weight (× 1.0)
      const scoreA = Math.log1p(a.upvotes) * (0.2 + 0.8 * relA);
      const scoreB = Math.log1p(b.upvotes) * (0.2 + 0.8 * relB);
      return scoreB - scoreA;
    });
  }

  private isUsefulComment(body: string): boolean {
    const trimmed = body.trim();
    if (!trimmed) return false;
    if (trimmed === '[deleted]' || trimmed === '[removed]') return false;
    return trimmed.length >= 30;
  }

  private buildTopDiscussionThreads(
    postsWithComments: RedditPostWithComments[],
  ): RedditReport['topDiscussionThreads'] {
    return postsWithComments
      .flatMap((post) =>
        post.comments
          .filter(
            (comment) => this.isUsefulComment(comment.body) && (comment.replies?.length ?? 0) > 0,
          )
          .map((comment) => ({
            postTitle: post.title,
            subreddit: post.subreddit,
            postUrl: `https://www.reddit.com${post.permalink}`,
            parentComment: {
              author: comment.author,
              text: comment.body.slice(0, MAX_COMMENT_CHARS),
              upvotes: comment.upvotes,
            },
            replies: (comment.replies ?? [])
              .filter((reply) => this.isUsefulComment(reply.body))
              .sort((a, b) => b.upvotes - a.upvotes)
              .slice(0, 5)
              .map((reply) => ({
                author: reply.author,
                text: reply.body.slice(0, MAX_COMMENT_CHARS),
                upvotes: reply.upvotes,
                permalink: reply.permalink,
              })),
          }))
          .filter((thread) => thread.replies.length > 0),
      )
      .sort((a, b) => b.parentComment.upvotes - a.parentComment.upvotes)
      .slice(0, 5);
  }
}
