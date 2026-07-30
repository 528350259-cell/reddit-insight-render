// ---------------------------------------------------------------------------
// Feishu interactive card builders
// Phase 1: processing / error cards
// Phase 2: analysis result card (see buildResultCard)
// ---------------------------------------------------------------------------

export function buildProcessingCard(prompt: string): object {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '⏳ Reddit 分析中' },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**正在分析：** ${prompt}\n\n正在抓取 Reddit 并用 AI 整理痛点，通常需要 30–60 秒，请稍候…`,
        },
      },
    ],
  };
}

export function buildUnsupportedCard(): object {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '⚠️ 暂不支持该消息类型' },
      template: 'yellow',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content:
            '目前只支持文本消息。直接发送一句话，例如：\n**分析 AI coding tools 在 Reddit 上的用户痛点**',
        },
      },
    ],
  };
}

export function buildEmptyPromptCard(): object {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '⚠️ 没有识别到问题' },
      template: 'yellow',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content:
            '没有识别到有效问题。直接发送一句话，例如：\n**分析 book nook kit 用户最喜欢和最不满意什么**',
        },
      },
    ],
  };
}

export function buildErrorCard(message: string): object {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '❌ 分析失败' },
      template: 'red',
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: message },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Phase 2: result card — called after TrackerService finishes
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  prompt: string;
  reportUrl: string;
  subreddits: string[];
  sentiment: string;
  topTerms: string;
  painPoints: string[];
  comfortPoints: string[];
  summary: string;
}

export function buildResultCard(r: AnalysisResult): object {
  const painMd = r.painPoints.length
    ? r.painPoints
        .slice(0, 3)
        .map((p) => `- ${p}`)
        .join('\n')
    : '- 暂未提取到明显痛点';

  const comfortMd = r.comfortPoints.length
    ? r.comfortPoints
        .slice(0, 2)
        .map((p) => `- ${p}`)
        .join('\n')
    : '- 暂未提取到明显喜欢点';

  const subsMd = r.subreddits.map((s) => `r/${s}`).join('、');

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '✅ Reddit 分析完成' },
      template: 'green',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**问题：** ${r.prompt}\n**Subreddits：** ${subsMd}\n**情绪：** ${r.sentiment}${r.topTerms ? `\n**高频词：** ${r.topTerms}` : ''}`,
        },
      },
      { tag: 'hr' },
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `**核心痛点**\n${painMd}` },
      },
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `**用户喜欢**\n${comfortMd}` },
      },
      { tag: 'hr' },
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `**摘要**\n${r.summary}` },
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '查看完整报告' },
            type: 'primary',
            url: r.reportUrl,
          },
        ],
      },
    ],
  };
}
