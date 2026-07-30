import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ReportView } from './ReportView';
import type { RedditReport } from '../tracker.types';

const mockReport: RedditReport = {
  executiveSummary: 'Developers have mixed feelings about AI tools.',
  frequentTerms: [
    { term: 'speed', count: 4, context: 'Users repeatedly mention faster drafting and iteration.' },
    { term: 'accuracy', count: 3, context: 'People often question output reliability.' },
  ],
  termGlossary: [
    {
      term: 'DX',
      explanationZh: 'Developer Experience 的缩写，通常指开发者使用工具时的整体体验。',
      context: 'Reddit 用户常用它评价工具是否顺手。',
    },
  ],
  painPoints: ['Hallucinated code still creates review overhead.'],
  comfortPoints: ['Fast scaffolding feels convenient for repetitive tasks.'],
  topDiscussionThreads: [
    {
      postTitle: 'Top AI Tools for 2024',
      subreddit: 'webdev',
      postUrl: 'https://reddit.com/r/webdev/post1',
      parentComment: {
        author: 'commenter1',
        text: 'The biggest issue is still trust in generated code.',
        upvotes: 88,
      },
      replies: [
        {
          author: 'reply1',
          text: 'Same here, I always review every generated block.',
          upvotes: 34,
          permalink: '/r/webdev/comments/post1/comment1/reply1',
        },
      ],
    },
  ],
  themes: [
    {
      title: 'Productivity Boost',
      description: 'Many developers report faster coding.',
    },
    {
      title: 'Code Quality Concerns',
      description: 'Some worry about technical debt.',
    },
  ],
  sentiment: { overall: 'mixed' as const, rationale: 'Opinions vary widely.' },
  notableQuotes: [
    {
      text: 'AI tools are amazing',
      subreddit: 'programming',
      url: 'https://reddit.com/r/programming/1',
    },
  ],
  topPosts: [
    {
      title: 'Top AI Tools for 2024',
      subreddit: 'webdev',
      upvotes: 1234,
      commentCount: 89,
      url: 'https://reddit.com/r/webdev/post1',
    },
  ],
};

describe('ReportView', () => {
  const onExportMarkdown = vi.fn();
  const onExportJson = vi.fn();

  const defaultProps = {
    prompt: 'AI tools research',
    report: mockReport,
    onExportMarkdown,
    onExportJson,
  };

  beforeEach(() => {
    onExportMarkdown.mockClear();
    onExportJson.mockClear();
  });

  it('renders the research prompt', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText('AI tools research')).toBeInTheDocument();
  });

  it('renders executive summary', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText('Developers have mixed feelings about AI tools.')).toBeInTheDocument();
  });

  it('renders all themes', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText('Productivity Boost')).toBeInTheDocument();
    expect(screen.getByText('Code Quality Concerns')).toBeInTheDocument();
  });

  it('renders frequent terms', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText(/speed x 4/i)).toBeInTheDocument();
    expect(screen.getByText(/accuracy x 3/i)).toBeInTheDocument();
  });

  it('renders term glossary annotations', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText('术语注释')).toBeInTheDocument();
    expect(screen.getByText('DX')).toBeInTheDocument();
    expect(screen.getByText(/Developer Experience/)).toBeInTheDocument();
  });

  it('renders pain points and comfort points', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText('用户痛点')).toBeInTheDocument();
    expect(screen.getByText('用户舒适点')).toBeInTheDocument();
  });

  it('renders sentiment badge', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText('多元')).toBeInTheDocument();
  });

  it('renders notable quotes', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText(/"AI tools are amazing"/)).toBeInTheDocument();
  });

  it('renders top posts', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getAllByText('Top AI Tools for 2024').length).toBeGreaterThan(0);
  });

  it('renders top discussion threads', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText('高互动讨论')).toBeInTheDocument();
    expect(
      screen.getByText('The biggest issue is still trust in generated code.'),
    ).toBeInTheDocument();
  });

  it('calls onExportMarkdown when Markdown button clicked', () => {
    render(<ReportView {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /markdown/i }));

    expect(onExportMarkdown).toHaveBeenCalledOnce();
  });

  it('calls onExportJson when JSON button clicked', () => {
    render(<ReportView {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /json/i }));

    expect(onExportJson).toHaveBeenCalledOnce();
  });

  it('does not render themes section when themes array is empty', () => {
    render(<ReportView {...defaultProps} report={{ ...mockReport, themes: [] }} />);

    expect(screen.queryByText('关键主题')).not.toBeInTheDocument();
  });

  it('does not render quotes section when notableQuotes is empty', () => {
    render(<ReportView {...defaultProps} report={{ ...mockReport, notableQuotes: [] }} />);

    expect(screen.queryByText('代表性原话')).not.toBeInTheDocument();
  });

  it('renders theme descriptions', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText('Many developers report faster coding.')).toBeInTheDocument();
    expect(screen.getByText('Some worry about technical debt.')).toBeInTheDocument();
  });

  it('renders the subreddit attribution for notable quotes', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText('r/programming')).toBeInTheDocument();
  });

  it('renders the sentiment rationale', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText('Opinions vary widely.')).toBeInTheDocument();
  });

  it('does not render the Top Posts section when topPosts is empty', () => {
    render(<ReportView {...defaultProps} report={{ ...mockReport, topPosts: [] }} />);

    expect(screen.queryByText('热门帖子')).not.toBeInTheDocument();
  });

  it('formats upvote count with locale separators', () => {
    render(<ReportView {...defaultProps} />);

    expect(screen.getByText(/1,234 赞/)).toBeInTheDocument();
  });

  it('renders positive sentiment badge text', () => {
    render(
      <ReportView
        {...defaultProps}
        report={{
          ...mockReport,
          sentiment: { overall: 'positive' as const, rationale: 'Mostly good.' },
        }}
      />,
    );

    expect(screen.getByText('正向')).toBeInTheDocument();
  });

  it('renders negative sentiment badge text', () => {
    render(
      <ReportView
        {...defaultProps}
        report={{
          ...mockReport,
          sentiment: { overall: 'negative' as const, rationale: 'Mostly bad.' },
        }}
      />,
    );

    expect(screen.getByText('负向')).toBeInTheDocument();
  });
});
