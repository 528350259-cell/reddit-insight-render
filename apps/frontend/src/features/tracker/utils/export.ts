import type { RedditReport } from '../tracker.types';

const sentimentLabel: Record<string, string> = {
  positive: '正向',
  negative: '负向',
  neutral: '中性',
  mixed: '多元',
};

export const exportAsMarkdown = (prompt: string, report: RedditReport): void => {
  const lines: string[] = [
    '# Reddit 话题分析报告',
    '',
    `**分析主题：** ${prompt}`,
    '',
    '## 摘要结论',
    '',
    report.executiveSummary,
    '',
    '## 高频词',
    '',
    ...report.frequentTerms.flatMap((item) => [
      `- ${item.term} (${item.count}) - ${item.context}`,
      '',
    ]),
  ];

  if (report.termGlossary.length) {
    lines.push('## 术语注释', '');
    for (const item of report.termGlossary) {
      lines.push(`- **${item.term}**：${item.explanationZh}`);
      if (item.context) lines.push(`  - 语境：${item.context}`);
    }
    lines.push('');
  }

  lines.push(
    '## 用户痛点',
    '',
    ...report.painPoints.map((item) => `- ${item}`),
    '',
    '## 用户舒适点',
    '',
    ...report.comfortPoints.map((item) => `- ${item}`),
    '',
    '## 关键主题',
    '',
    ...report.themes.flatMap((theme) => [`### ${theme.title}`, '', theme.description, '']),
    '## 情绪倾向',
    '',
    `**整体：** ${sentimentLabel[report.sentiment.overall] ?? report.sentiment.overall}`,
    '',
    report.sentiment.rationale,
    '',
  );

  if (report.notableQuotes.length) {
    lines.push('## 代表性原话', '');
    for (const quote of report.notableQuotes) {
      lines.push(`> "${quote.text}" [r/${quote.subreddit}](${quote.url})`, '');
    }
  }

  if (report.topPosts.length) {
    lines.push('## 热门帖子', '');
    for (const post of report.topPosts) {
      lines.push(
        `- [${post.title}](${post.url}) - r/${post.subreddit} - ${post.upvotes} 赞 - ${post.commentCount} 条评论`,
      );
    }
    lines.push('');
  }

  if (report.topDiscussionThreads.length) {
    lines.push('## 高互动讨论', '');
    for (const thread of report.topDiscussionThreads) {
      lines.push(`### ${thread.postTitle}`, '');
      lines.push(`- 社区：r/${thread.subreddit}`, '');
      lines.push(
        `- 主评论 ${thread.parentComment.author}（${thread.parentComment.upvotes} 赞）：${thread.parentComment.text}`,
        '',
      );
      for (const reply of thread.replies) {
        lines.push(
          `  - 回复 ${reply.author}（${reply.upvotes} 赞）：${reply.text} [link](https://www.reddit.com${reply.permalink})`,
        );
      }
      lines.push('');
    }
  }

  downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown' }), 'reddit-report.md');
};

export const exportAsJson = (data: unknown): void => {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    'reddit-report.json',
  );
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
