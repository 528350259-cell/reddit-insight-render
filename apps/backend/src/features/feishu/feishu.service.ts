import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AnalyzePlanDto } from '../tracker/dto/analyze-plan.dto';
import type { ScrapingPlan } from '../llm/llm.types';
import { TrackerService } from '../tracker/tracker.service';
import { ConfigService } from '../../shared';
import type { FeishuCliMessageEvent, FeishuEventPayload } from './feishu.types';

type TenantTokenCache = {
  token: string;
  expiresAt: number;
} | null;

type TimeRange = AnalyzePlanDto['timeRange'];
type AnalyzeResult = Awaited<ReturnType<TrackerService['analyzePlan']>>;

type PendingPlanState = {
  cardMessageId: string;
  chatId: string;
  prompt: string;
  plan: ScrapingPlan;
  initiatorSenderId?: string;
  initiatorOpenId?: string;
  initiatorUserId?: string;
  selectedSubreddits: string[];
  timeRange: TimeRange;
  awaitingQueryInput?: boolean;
  awaitingSubredditInput?: boolean;
  createdAt: number;
};

type ChannelLike = {
  send: (
    to: string,
    input: { text: string } | { card: object },
    opts?: { replyTo?: string },
  ) => Promise<{ messageId: string }>;
  updateCard: (messageId: string, card: object) => Promise<void>;
};

@Injectable()
export class FeishuService {
  private readonly logger = new Logger(FeishuService.name);
  private tenantTokenCache: TenantTokenCache = null;
  private readonly pendingPlans = new Map<string, PendingPlanState>();
  private readonly latestPlanByChat = new Map<string, string>();

  constructor(
    private readonly trackerService: TrackerService,
    private readonly configService: ConfigService,
  ) {}

  async handleEvent(payload: FeishuEventPayload): Promise<{ challenge?: string; ok: true }> {
    this.assertVerificationToken(payload);

    if (payload.type === 'url_verification') {
      return { challenge: payload.challenge, ok: true };
    }

    if (payload.header?.event_type !== 'im.message.receive_v1' || !payload.event?.message) {
      return { ok: true };
    }

    return { ok: true };
  }

  async handleCliMessageEvent(event: FeishuCliMessageEvent): Promise<{ ok: true }> {
    if (event.type !== 'im.message.receive_v1') {
      return { ok: true };
    }

    return { ok: true };
  }

  async handleChannelMessage(
    message: {
      chatId: string;
      messageId: string;
      content: string;
      senderId?: string;
      openId?: string;
      userId?: string;
      replyToMessageId?: string;
    },
    channel: ChannelLike,
  ): Promise<void> {
    const prompt = this.normalizePrompt(message.content);
    const pending = this.findPendingPlanForMessage(message);

    if (pending) {
      this.logger.log(
        `[Feishu] matched message ${message.messageId} to plan ${pending.cardMessageId} (awaitingQuery=${Boolean(
          pending.awaitingQueryInput,
        )}, awaitingSubreddit=${Boolean(pending.awaitingSubredditInput)})`,
      );
    }

    if (!prompt) {
      await channel.send(
        message.chatId,
        {
          card: this.buildInfoCard(
            '未识别到有效问题',
            '请直接发送一个研究问题，例如：分析佩戴 hijab 人群在 Reddit 上的痛点。',
          ),
        },
        { replyTo: message.messageId },
      );
      return;
    }

    if (pending?.awaitingSubredditInput && this.isMessageSenderAllowed(pending, message)) {
      const command = prompt.trim().toLowerCase();
      if (['取消', 'cancel', '算了'].includes(command)) {
        pending.awaitingSubredditInput = false;
        await channel.updateCard(pending.cardMessageId, this.buildPlanCard(pending));
        await channel.send(
          message.chatId,
          { card: this.buildInfoCard('已取消添加社区', '当前计划保持不变。', 'grey') },
          { replyTo: message.messageId },
        );
        return;
      }

      const nextSubreddit = prompt.trim().replace(/^r\//i, '').replace(/\s+/g, '');
      pending.awaitingSubredditInput = false;

      if (!nextSubreddit) {
        await channel.updateCard(pending.cardMessageId, this.buildPlanCard(pending));
        return;
      }

      if (!pending.plan.subreddits.includes(nextSubreddit)) {
        pending.plan.subreddits = [...pending.plan.subreddits, nextSubreddit];
      }

      if (!pending.selectedSubreddits.includes(nextSubreddit)) {
        pending.selectedSubreddits = [...pending.selectedSubreddits, nextSubreddit];
      }

      await channel.updateCard(pending.cardMessageId, this.buildPlanCard(pending));
      await channel.send(
        message.chatId,
        { card: this.buildInfoCard('已添加社区', `r/${nextSubreddit}`, 'green') },
        { replyTo: message.messageId },
      );
      return;
    }

    if (pending?.awaitingQueryInput && this.isMessageSenderAllowed(pending, message)) {
      const command = prompt.trim().toLowerCase();
      if (['取消', 'cancel', '算了'].includes(command)) {
        pending.awaitingQueryInput = false;
        await channel.updateCard(pending.cardMessageId, this.buildPlanCard(pending));
        await channel.send(
          message.chatId,
          { card: this.buildInfoCard('已取消添加搜索词', '当前计划保持不变。', 'grey') },
          { replyTo: message.messageId },
        );
        return;
      }

      const nextQuery = prompt.trim();
      pending.awaitingQueryInput = false;

      if (pending.plan.queries.includes(nextQuery)) {
        await channel.updateCard(pending.cardMessageId, this.buildPlanCard(pending));
        await channel.send(
          message.chatId,
          {
            card: this.buildInfoCard(
              '搜索词已存在',
              `“${nextQuery}”已经在当前计划里了，没有重复添加。`,
              'yellow',
            ),
          },
          { replyTo: message.messageId },
        );
        return;
      }

      pending.plan.queries = [...pending.plan.queries, nextQuery];
      await channel.updateCard(pending.cardMessageId, this.buildPlanCard(pending));
      await channel.send(
        message.chatId,
        { card: this.buildInfoCard('已添加搜索词', nextQuery, 'green') },
        { replyTo: message.messageId },
      );
      return;
    }

    if (pending) {
      const commandHandled = await this.tryHandlePlanCommand(message, prompt, pending, channel);
      if (commandHandled) {
        return;
      }
    }

    if (this.isAnalyzeConfirmation(prompt)) {
      const repliedMessageId = message.replyToMessageId || pendingMessageId;
      const repliedPending = repliedMessageId ? this.pendingPlans.get(repliedMessageId) : pending;

      if (!repliedPending) {
        await channel.send(
          message.chatId,
          {
            card: this.buildInfoCard(
              '没有待确认的分析计划',
              '请先发送一个研究问题。我会先推荐相关社区和时间范围，再由你确认开始分析。',
            ),
          },
          { replyTo: message.messageId },
        );
        return;
      }

      await channel.updateCard(
        repliedPending.cardMessageId,
        this.buildProcessingCard(repliedPending),
      );
      void this.finishAnalysisInBackground(repliedPending, channel);
      return;
    }

    const plan = await this.trackerService.generatePlan({ prompt });
    const draft = this.createPendingPlanDraft(message, prompt, plan);
    const sent = await channel.send(
      message.chatId,
      { card: this.buildPlanCard(draft) },
      { replyTo: message.messageId },
    );

    draft.cardMessageId = sent.messageId;
    this.pendingPlans.set(sent.messageId, draft);
    this.latestPlanByChat.set(message.chatId, sent.messageId);
    this.trimStalePlans();
  }

  async handleCardAction(
    event: {
      messageId: string;
      chatId: string;
      operator?: {
        openId?: string;
        userId?: string;
      };
      raw?: unknown;
      action: {
        value?: Record<string, unknown>;
        option?: string;
        name?: string;
      };
    },
    channel: ChannelLike,
  ): Promise<void> {
    const planState = this.pendingPlans.get(event.messageId);
    if (!planState) {
      await channel.updateCard(
        event.messageId,
        this.buildInfoCard(
          '这张计划卡片已失效',
          '请重新发送你的问题，生成一张新的分析计划卡片。',
          'grey',
        ),
      );
      return;
    }

    const actionValue = (event.action.value ?? {}) as Record<string, unknown>;
    const kind = String(actionValue.kind ?? '');

    if (!this.canOperatePlan(planState, event)) {
      await channel.send(
        event.chatId,
        {
          card: this.buildInfoCard(
            '此卡片仅限发起人操作',
            '这张分析卡片当前只允许最初 @ 机器人的发起人修改或开始分析。',
            'yellow',
          ),
        },
        { replyTo: event.messageId },
      );
      return;
    }

    if (kind === 'toggle_subreddit') {
      const subreddit = String(actionValue.subreddit ?? '')
        .replace(/^r\//i, '')
        .trim();
      if (!subreddit) return;

      const selected = new Set(planState.selectedSubreddits);
      if (selected.has(subreddit)) {
        if (selected.size > 1) {
          selected.delete(subreddit);
        }
      } else {
        selected.add(subreddit);
      }

      planState.selectedSubreddits = planState.plan.subreddits.filter((item) => selected.has(item));
      await channel.updateCard(event.messageId, this.buildPlanCard(planState));
      return;
    }

    if (kind === 'remove_query') {
      const query = String(actionValue.query ?? '').trim();
      if (!query) return;

      planState.plan.queries = planState.plan.queries.filter((item) => item !== query);
      await channel.updateCard(event.messageId, this.buildPlanCard(planState));
      return;
    }

    if (kind === 'request_add_query') {
      planState.awaitingQueryInput = true;
      planState.awaitingSubredditInput = false;
      await channel.updateCard(event.messageId, this.buildPlanCard(planState));
      await channel.send(
        event.chatId,
        {
          card: this.buildInfoCard(
            '请发送一条新的搜索词',
            '请直接发送下一条消息作为新的搜索词。群聊里请继续 @ 我发送，收到后我会自动把它加入当前计划卡。',
            'blue',
          ),
        },
        { replyTo: event.messageId },
      );
      return;
    }

    if (kind === 'request_add_subreddit') {
      planState.awaitingSubredditInput = true;
      planState.awaitingQueryInput = false;
      await channel.updateCard(event.messageId, this.buildPlanCard(planState));
      await channel.send(
        event.chatId,
        {
          card: this.buildInfoCard(
            '请发送一个新的社区',
            '请直接发送下一条消息作为新的 subreddit。可以发送 r/xxx 或 xxx。群聊里请继续 @ 我发送，回复“取消”可退出。',
            'blue',
          ),
        },
        { replyTo: event.messageId },
      );
      return;
    }

    if (kind === 'set_time_range') {
      const nextTimeRange = (event.action.option || actionValue.timeRange) as TimeRange | undefined;
      if (nextTimeRange && ['day', 'week', 'month', 'year'].includes(nextTimeRange)) {
        planState.timeRange = nextTimeRange;
        await channel.updateCard(event.messageId, this.buildPlanCard(planState));
      }
      return;
    }

    if (kind === 'start_analysis') {
      await channel.updateCard(event.messageId, this.buildProcessingCard(planState));
      void this.finishAnalysisInBackground(planState, channel);
    }
  }

  private async finishAnalysisInBackground(
    planState: PendingPlanState,
    channel: ChannelLike,
  ): Promise<void> {
    try {
      const result = await this.trackerService.analyzePlan({
        prompt: planState.prompt,
        subreddits: planState.selectedSubreddits,
        queries: planState.plan.queries,
        timeRange: planState.timeRange,
      });

      await channel.updateCard(planState.cardMessageId, this.buildResultCard(planState, result));
    } catch (error) {
      this.logger.error('Feishu analysis failed', error instanceof Error ? error.stack : undefined);
      const message = error instanceof Error ? error.message : '分析失败，请稍后重试。';
      await channel.updateCard(planState.cardMessageId, this.buildErrorCard(message));
    }
  }

  private async tryHandlePlanCommand(
    message: {
      chatId: string;
      messageId: string;
      senderId?: string;
      openId?: string;
      userId?: string;
    },
    prompt: string,
    planState: PendingPlanState,
    channel: ChannelLike,
  ): Promise<boolean> {
    if (!this.isMessageSenderAllowed(planState, message)) {
      return false;
    }

    const addMatch = prompt.match(/^(?:添加搜索词|add query)\s*[:：]\s*(.+)$/i);
    if (addMatch) {
      const query = addMatch[1].trim();
      if (!query) {
        return true;
      }

      if (planState.plan.queries.includes(query)) {
        await channel.send(
          message.chatId,
          {
            card: this.buildInfoCard(
              '搜索词已存在',
              `“${query}”已经在当前计划里了，没有重复添加。`,
              'yellow',
            ),
          },
          { replyTo: message.messageId },
        );
        return true;
      }

      planState.plan.queries = [...planState.plan.queries, query];
      await channel.updateCard(planState.cardMessageId, this.buildPlanCard(planState));
      await channel.send(
        message.chatId,
        { card: this.buildInfoCard('已添加搜索词', query, 'green') },
        { replyTo: message.messageId },
      );
      return true;
    }

    const removeMatch = prompt.match(/^(?:删除搜索词|remove query)\s*[:：]\s*(.+)$/i);
    if (removeMatch) {
      const query = removeMatch[1].trim();
      const nextQueries = planState.plan.queries.filter((item) => item !== query);
      if (nextQueries.length > 0) {
        planState.plan.queries = nextQueries;
      }

      planState.awaitingQueryInput = false;
      await channel.updateCard(planState.cardMessageId, this.buildPlanCard(planState));
      await channel.send(
        message.chatId,
        { card: this.buildInfoCard('已删除搜索词', query, 'green') },
        { replyTo: message.messageId },
      );
      return true;
    }

    if (/^(?:清空搜索词|clear queries)$/i.test(prompt)) {
      planState.plan.queries = [];
      planState.awaitingQueryInput = false;
      await channel.updateCard(planState.cardMessageId, this.buildPlanCard(planState));
      await channel.send(
        message.chatId,
        {
          card: this.buildInfoCard(
            '已清空搜索词',
            '当前计划中的搜索词已清空。你可以继续添加新的搜索词。',
            'green',
          ),
        },
        { replyTo: message.messageId },
      );
      return true;
    }

    if (/^(?:查看当前计划|view current plan)$/i.test(prompt)) {
      await channel.updateCard(planState.cardMessageId, this.buildPlanCard(planState));
      await channel.send(
        message.chatId,
        {
          card: this.buildInfoCard(
            '当前计划已刷新',
            '已将最新的社区、搜索词和时间范围同步到计划卡片。',
            'blue',
          ),
        },
        { replyTo: message.messageId },
      );
      return true;
    }

    return false;
  }

  private createPendingPlanDraft(
    message: {
      chatId: string;
      senderId?: string;
      openId?: string;
      userId?: string;
    },
    prompt: string,
    plan: ScrapingPlan,
  ): PendingPlanState {
    return {
      cardMessageId: '',
      chatId: message.chatId,
      prompt,
      plan,
      initiatorSenderId: message.senderId,
      initiatorOpenId: message.openId,
      initiatorUserId: message.userId,
      selectedSubreddits: [...plan.subreddits],
      timeRange: plan.timeRange,
      awaitingQueryInput: false,
      awaitingSubredditInput: false,
      createdAt: Date.now(),
    };
  }

  private buildPlanCard(planState: PendingPlanState): Record<string, unknown> {
    const subredditButtons = planState.plan.subreddits.map((subreddit) => {
      const selected = planState.selectedSubreddits.includes(subreddit);
      return {
        tag: 'button',
        type: selected ? 'primary' : 'default',
        text: {
          tag: 'plain_text',
          content: `${selected ? '已选：' : ''}r/${subreddit}`,
        },
        value: {
          kind: 'toggle_subreddit',
          subreddit,
        },
      };
    });

    const queryDeleteButtons = planState.plan.queries.slice(0, 8).map((query) => ({
      tag: 'button',
      type: 'default',
      text: {
        tag: 'plain_text',
        content: `删除：${this.truncateText(query, 14)}`,
      },
      value: {
        kind: 'remove_query',
        query,
      },
      confirm: {
        title: { tag: 'plain_text', content: '删除这个搜索词？' },
        text: {
          tag: 'plain_text',
          content: query,
        },
      },
    }));

    const selectedSubredditsText =
      planState.selectedSubreddits.length > 0
        ? planState.selectedSubreddits.map((subreddit) => `r/${subreddit}`).join(' / ')
        : '- 暂无';

    return {
      config: {
        wide_screen_mode: true,
        enable_forward: true,
      },
      header: {
        template: 'blue',
        title: {
          tag: 'plain_text',
          content: 'Reddit 分析计划',
        },
      },
      elements: [
        this.buildMarkdownBlock('研究问题', planState.prompt),
        {
          tag: 'div',
          fields: [
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**时间范围**\n${this.formatTimeRange(planState.timeRange)}`,
              },
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**已选社区**\n${planState.selectedSubreddits.length}/${planState.plan.subreddits.length}`,
              },
            },
          ],
        },
        this.buildDivider(),
        this.buildMarkdownBlock('当前社区', selectedSubredditsText),
        this.buildMarkdownBlock(
          '搜索词',
          planState.plan.queries.length > 0
            ? planState.plan.queries.map((query, index) => `${index + 1}. ${query}`).join('\n')
            : '- 暂无',
        ),
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              type: planState.awaitingSubredditInput ? 'primary' : 'default',
              text: {
                tag: 'plain_text',
                content: planState.awaitingSubredditInput ? '等待社区输入中…' : '添加社区',
              },
              value: {
                kind: 'request_add_subreddit',
              },
            },
            {
              tag: 'button',
              type: planState.awaitingQueryInput ? 'primary' : 'default',
              text: {
                tag: 'plain_text',
                content: planState.awaitingQueryInput ? '等待输入中…' : '添加搜索词',
              },
              value: {
                kind: 'request_add_query',
              },
            },
          ],
        },
        ...(queryDeleteButtons.length > 0
          ? [
              {
                tag: 'action',
                layout: 'flow',
                actions: queryDeleteButtons,
              },
            ]
          : []),
        {
          tag: 'action',
          layout: 'flow',
          actions: subredditButtons,
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'select_static',
              placeholder: {
                tag: 'plain_text',
                content: '选择时间范围',
              },
              initial_option: planState.timeRange,
              options: [
                { text: { tag: 'plain_text', content: '过去 24 小时' }, value: 'day' },
                { text: { tag: 'plain_text', content: '过去一周' }, value: 'week' },
                { text: { tag: 'plain_text', content: '过去一个月' }, value: 'month' },
                { text: { tag: 'plain_text', content: '过去一年' }, value: 'year' },
              ],
              value: {
                kind: 'set_time_range',
              },
            },
            {
              tag: 'button',
              type: 'primary',
              text: {
                tag: 'plain_text',
                content: '开始分析',
              },
              value: {
                kind: 'start_analysis',
              },
              confirm: {
                title: { tag: 'plain_text', content: '开始分析？' },
                text: {
                  tag: 'plain_text',
                  content: '将基于当前选择的社区和时间范围开始分析。',
                },
              },
            },
          ],
        },
        ...(planState.plan.rationale?.trim()
          ? [this.buildDivider(), this.buildMarkdownBlock('推荐理由', planState.plan.rationale)]
          : []),
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: '提示：群聊里所有人都能看到这张卡片，但只有发起人可以操作。',
            },
            {
              tag: 'plain_text',
              content: planState.awaitingQueryInput
                ? '当前正在等待你发送下一条搜索词消息。群聊里请继续 @ 我发送，回复“取消”可退出。'
                : planState.awaitingSubredditInput
                  ? '当前正在等待你发送下一条社区消息。群聊里请继续 @ 我发送 r/xxx 或 xxx，回复“取消”可退出。'
                  : '点击“添加社区”或“添加搜索词”后，直接发送下一条消息即可加入当前计划。群聊里请继续 @ 我。',
            },
          ],
        },
      ],
    };
  }

  private buildProcessingCard(planState: PendingPlanState): Record<string, unknown> {
    return {
      config: {
        wide_screen_mode: true,
      },
      header: {
        template: 'indigo',
        title: {
          tag: 'plain_text',
          content: '分析中',
        },
      },
      elements: [
        this.buildMarkdownBlock('研究问题', planState.prompt),
        {
          tag: 'div',
          fields: [
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**时间范围**\n${this.formatTimeRange(planState.timeRange)}`,
              },
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**已选社区数**\n${planState.selectedSubreddits.length}`,
              },
            },
          ],
        },
        this.buildDivider(),
        this.buildMarkdownBlock(
          '已选社区',
          planState.selectedSubreddits.map((subreddit) => `r/${subreddit}`).join(' / '),
        ),
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: '正在抓取帖子与评论，并整理高频词、痛点、舒适点和高互动讨论。',
            },
          ],
        },
      ],
    };
  }

  private buildResultCard(
    planState: PendingPlanState,
    result: AnalyzeResult,
  ): Record<string, unknown> {
    const { report } = result;
    const frequentTerms = report.frequentTerms
      .slice(0, 5)
      .map(
        (item) =>
          `- **${this.escapeCardText(item.term)}** (${item.count})：${this.escapeCardText(item.context)}`,
      )
      .join('\n');
    const termGlossary = report.termGlossary
      .slice(0, 8)
      .map((item) => {
        const context = item.context ? `\n  语境：${this.escapeCardText(item.context)}` : '';
        return `- **${this.escapeCardText(item.term)}**：${this.escapeCardText(item.explanationZh)}${context}`;
      })
      .join('\n');
    const painPoints = report.painPoints
      .slice(0, 5)
      .map((item) => `- ${this.escapeCardText(item)}`)
      .join('\n');
    const comfortPoints = report.comfortPoints
      .slice(0, 5)
      .map((item) => `- ${this.escapeCardText(item)}`)
      .join('\n');
    const topPosts = report.topPosts
      .slice(0, 5)
      .map(
        (post, index) =>
          `${index + 1}. **[r/${this.escapeCardText(post.subreddit)}]** ${this.escapeCardText(
            post.title,
          )}\n   ${post.upvotes} 赞 / ${post.commentCount} 评论\n   ${this.escapeCardText(post.url)}`,
      )
      .join('\n');
    const threads = report.topDiscussionThreads
      .slice(0, 5)
      .map((thread, index) => {
        const topReplies = thread.replies
          .slice(0, 5)
          .map(
            (reply) =>
              `- ${this.escapeCardText(reply.text)}（${reply.upvotes} 赞）\n  ${this.escapeCardText(
                `https://www.reddit.com${reply.permalink}`,
              )}`,
          )
          .join('\n');

        return [
          `${index + 1}. **[r/${this.escapeCardText(thread.subreddit)}] ${this.escapeCardText(
            thread.postTitle,
          )}**`,
          '',
          `> ${this.escapeCardText(thread.parentComment.text)}`,
          '',
          `主评论：${this.escapeCardText(thread.parentComment.author)} · ${thread.parentComment.upvotes} 赞`,
          '',
          topReplies ? `**高赞回复**\n${topReplies}` : '',
          '',
          this.escapeCardText(thread.postUrl),
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');
    const themes = report.themes
      .slice(0, 5)
      .map(
        (theme) =>
          `- **${this.escapeCardText(theme.title)}**：${this.escapeCardText(theme.description)}`,
      )
      .join('\n');
    const quotes = report.notableQuotes
      .slice(0, 5)
      .map(
        (quote) =>
          `> ${this.escapeCardText(quote.text)}\n\nr/${this.escapeCardText(
            quote.subreddit,
          )} · ${this.escapeCardText(quote.url)}`,
      )
      .join('\n\n');

    return {
      schema: '2.0',
      config: {
        update_multi: true,
        width_mode: 'fill',
        enable_forward: true,
        summary: {
          content: `Reddit 分析结果：${this.truncateText(planState.prompt, 40)}`,
        },
      },
      header: {
        template: 'green',
        title: {
          tag: 'plain_text',
          content: 'Reddit 分析结果',
        },
        subtitle: {
          tag: 'plain_text',
          content: `${this.formatSentiment(report.sentiment.overall)} · ${this.formatTimeRange(planState.timeRange)} · ${planState.selectedSubreddits.length} 个社区`,
        },
      },
      body: {
        padding: '12px',
        vertical_spacing: '8px',
        elements: [
          this.buildV2Markdown(
            `**研究问题**\n${this.escapeCardText(planState.prompt)}\n\n**已分析社区**\n${planState.selectedSubreddits
              .map((subreddit) => `r/${this.escapeCardText(subreddit)}`)
              .join(' / ')}`,
            'intro',
          ),
          this.buildV2Markdown(
            `| 指标 | 内容 |\n| --- | --- |\n| 情绪倾向 | ${this.formatSentiment(
              report.sentiment.overall,
            )} |\n| 时间范围 | ${this.formatTimeRange(planState.timeRange)} |\n| 社区数量 | ${
              planState.selectedSubreddits.length
            } |`,
            'metrics',
          ),
          this.buildV2Section(
            '摘要结论',
            this.escapeCardText(report.executiveSummary),
            'p_summary',
          ),
          ...(frequentTerms ? [this.buildV2Section('高频词', frequentTerms, 'p_terms')] : []),
          ...(termGlossary ? [this.buildV2Section('术语注释', termGlossary, 'p_glossary')] : []),
          this.buildV2Section('核心痛点', painPoints || '- 暂未提取到明确痛点', 'p_pain'),
          this.buildV2Section('舒适点', comfortPoints || '- 暂未提取到明确舒适点', 'p_comfort'),
          ...(themes ? [this.buildV2Section('关键主题', themes, 'p_themes')] : []),
          ...(quotes ? [this.buildV2Section('代表性原话', quotes, 'p_quotes')] : []),
          ...(topPosts ? [this.buildV2Section('热门帖子', topPosts, 'p_posts')] : []),
          ...(threads ? [this.buildV2Section('高互动讨论', threads, 'p_threads')] : []),
        ],
      },
    };
  }

  private buildErrorCard(message: string): Record<string, unknown> {
    return this.buildInfoCard('分析失败', message, 'red');
  }

  private buildInfoCard(
    title: string,
    message: string,
    template: 'blue' | 'yellow' | 'red' | 'green' | 'grey' = 'yellow',
  ): Record<string, unknown> {
    return {
      config: {
        wide_screen_mode: true,
      },
      header: {
        template,
        title: {
          tag: 'plain_text',
          content: title,
        },
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: message,
          },
        },
      ],
    };
  }

  private buildMarkdownBlock(title: string, content: string): Record<string, unknown> {
    return {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${title}**\n${content}`,
      },
    };
  }

  private buildDivider(): Record<string, unknown> {
    return {
      tag: 'hr',
    };
  }

  private buildV2Markdown(content: string, elementId: string): Record<string, unknown> {
    return {
      tag: 'markdown',
      element_id: elementId,
      content,
      text_size: 'normal',
    };
  }

  private buildV2Section(
    title: string,
    content: string,
    elementId: string,
  ): Record<string, unknown> {
    return this.buildV2Markdown(`---\n**${title}**\n\n${content}`, elementId);
  }

  private escapeCardText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&#60;').replace(/>/g, '&#62;');
  }

  private normalizePrompt(content?: string): string {
    if (!content) return '';

    const plainText = this.extractPlainText(content);

    return plainText
      .replace(/<at\s+user_id="[^"]+">.*?<\/at>/g, ' ')
      .replace(/@_[a-z0-9_:-]+\s*/gi, ' ')
      .replace(/@[^\s]+\s+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractPlainText(content: string): string {
    const trimmed = content.trim();
    if (!trimmed.startsWith('{')) {
      return trimmed;
    }

    try {
      const parsed = JSON.parse(trimmed) as { text?: string };
      if (typeof parsed.text === 'string') {
        return parsed.text;
      }
    } catch (error) {
      this.logger.warn(
        `[Feishu] failed to parse message content as JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return trimmed;
  }

  private isAnalyzeConfirmation(prompt: string): boolean {
    const normalized = prompt.toLowerCase();
    return [
      'start analysis',
      'confirm analysis',
      'confirm',
      'run',
      'analyze',
      'continue analysis',
      '开始分析',
    ].some((keyword) => normalized.includes(keyword));
  }

  private trimStalePlans(): void {
    const cutoff = Date.now() - 1000 * 60 * 30;
    for (const [messageId, state] of this.pendingPlans.entries()) {
      if (state.createdAt < cutoff) {
        this.pendingPlans.delete(messageId);
      }
    }
  }

  private findPendingPlanForMessage(message: {
    chatId: string;
    senderId?: string;
    openId?: string;
    userId?: string;
  }): PendingPlanState | undefined {
    const candidates = [...this.pendingPlans.values()]
      .filter((plan) => plan.chatId === message.chatId)
      .filter((plan) => this.isMessageSenderAllowed(plan, message))
      .sort((a, b) => b.createdAt - a.createdAt);

    const awaiting = candidates.find(
      (plan) => plan.awaitingQueryInput || plan.awaitingSubredditInput,
    );
    if (awaiting) {
      return awaiting;
    }

    const latestMessageId = this.latestPlanByChat.get(message.chatId);
    if (latestMessageId) {
      const latest = this.pendingPlans.get(latestMessageId);
      if (latest && this.isMessageSenderAllowed(latest, message)) {
        return latest;
      }
    }

    return candidates[0];
  }

  private canOperatePlan(
    planState: PendingPlanState,
    event: {
      operator?: {
        openId?: string;
        userId?: string;
      };
    },
  ): boolean {
    const operatorOpenId = event.operator?.openId?.trim();
    const operatorUserId = event.operator?.userId?.trim();

    if (planState.initiatorOpenId && operatorOpenId) {
      return planState.initiatorOpenId === operatorOpenId;
    }

    if (planState.initiatorUserId && operatorUserId) {
      return planState.initiatorUserId === operatorUserId;
    }

    if (planState.initiatorOpenId || planState.initiatorUserId) {
      return false;
    }

    return true;
  }

  private isMessageSenderAllowed(
    planState: PendingPlanState,
    message: {
      senderId?: string;
      openId?: string;
      userId?: string;
    },
  ): boolean {
    if (planState.initiatorOpenId && message.openId) {
      return planState.initiatorOpenId === message.openId;
    }

    if (planState.initiatorUserId && message.userId) {
      return planState.initiatorUserId === message.userId;
    }

    if (planState.initiatorSenderId && message.senderId) {
      return planState.initiatorSenderId === message.senderId;
    }

    if (planState.initiatorOpenId || planState.initiatorUserId || planState.initiatorSenderId) {
      return false;
    }

    return true;
  }

  private formatTimeRange(timeRange: TimeRange): string {
    return (
      {
        day: '过去 24 小时',
        week: '过去一周',
        month: '过去一个月',
        year: '过去一年',
      }[timeRange] ?? timeRange
    );
  }

  private formatSentiment(sentiment: string): string {
    return (
      {
        positive: '偏正向',
        negative: '偏负向',
        neutral: '中性',
        mixed: '混合',
      }[sentiment] ?? sentiment
    );
  }

  private truncateText(text: string, maxLength: number): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  private assertVerificationToken(payload: FeishuEventPayload): void {
    const verificationToken = this.configService.feishu.verificationToken;
    if (!verificationToken) return;

    const incomingToken =
      'header' in payload ? (payload.header?.token ?? payload.token) : payload.token;

    if (!incomingToken || incomingToken !== verificationToken) {
      throw new HttpException('Invalid Feishu verification token', HttpStatus.FORBIDDEN);
    }
  }

  private async getTenantAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tenantTokenCache && this.tenantTokenCache.expiresAt > now + 60_000) {
      return this.tenantTokenCache.token;
    }

    const { appId, appSecret } = this.configService.feishu;
    if (!appId || !appSecret) {
      throw new Error('FEISHU_APP_ID or FEISHU_APP_SECRET is not configured');
    }

    const response = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          app_id: appId,
          app_secret: appSecret,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to obtain Feishu tenant access token: HTTP ${response.status} ${body}`,
      );
    }

    const data = (await response.json()) as {
      code?: number;
      msg?: string;
      tenant_access_token?: string;
      expire?: number;
    };

    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(
        `Failed to obtain Feishu tenant access token: ${data.msg ?? 'unknown error'}`,
      );
    }

    this.tenantTokenCache = {
      token: data.tenant_access_token,
      expiresAt: now + (data.expire ?? 7200) * 1000,
    };

    return data.tenant_access_token;
  }
}
