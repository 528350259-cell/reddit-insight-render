import { Download, ExternalLink, FileJson, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { RedditReport } from '../tracker.types';

const sentimentColor: Record<string, string> = {
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  negative: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  mixed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const sentimentLabel: Record<string, string> = {
  positive: '正向',
  negative: '负向',
  neutral: '中性',
  mixed: '多元',
};

interface ReportViewProps {
  prompt: string;
  report: RedditReport;
  onExportMarkdown: () => void;
  onExportJson: () => void;
}

export const ReportView = ({ prompt, report, onExportMarkdown, onExportJson }: ReportViewProps) => {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            分析主题
          </p>
          <p className="text-sm font-medium">{prompt}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={onExportMarkdown}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Markdown</span>
            <Download className="ml-1 h-3 w-3" />
          </Button>
          <Button variant="outline" size="sm" onClick={onExportJson}>
            <FileJson className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">JSON</span>
            <Download className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </div>

      <Separator />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">摘要结论</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{report.executiveSummary}</p>
        </CardContent>
      </Card>

      {report.frequentTerms.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">高频词</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {report.frequentTerms.map((item, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {item.term} x {item.count}
                </Badge>
              ))}
            </div>
            <div className="space-y-2">
              {report.frequentTerms.map((item, index) => (
                <p key={index} className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{item.term}:</span> {item.context}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {report.termGlossary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">术语注释</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border rounded-md border">
              {report.termGlossary.map((item, index) => (
                <div key={index} className="grid gap-1 p-3 sm:grid-cols-[12rem_1fr] sm:gap-3">
                  <div className="font-mono text-sm font-medium text-foreground">{item.term}</div>
                  <div className="space-y-1">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.explanationZh}
                    </p>
                    {item.context && (
                      <p className="text-xs leading-relaxed text-muted-foreground/80">
                        {item.context}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(report.painPoints.length > 0 || report.comfortPoints.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {report.painPoints.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">用户痛点</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.painPoints.map((item, index) => (
                    <li key={index} className="text-sm leading-relaxed text-muted-foreground">
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {report.comfortPoints.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">用户舒适点</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.comfortPoints.map((item, index) => (
                    <li key={index} className="text-sm leading-relaxed text-muted-foreground">
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            情绪倾向
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                sentimentColor[report.sentiment.overall] ?? sentimentColor.neutral
              }`}
            >
              {sentimentLabel[report.sentiment.overall] ?? report.sentiment.overall}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {report.sentiment.rationale}
          </p>
        </CardContent>
      </Card>

      {report.themes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">关键主题</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.themes.map((theme, index) => (
              <Card key={index}>
                <CardHeader className="pb-1 pt-4">
                  <CardTitle className="text-sm">{theme.title}</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {theme.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {report.notableQuotes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">代表性原话</h3>
          <div className="space-y-2">
            {report.notableQuotes.map((quote, index) => (
              <blockquote key={index} className="border-l-2 border-border py-1 pl-4">
                <p className="text-sm italic leading-relaxed text-muted-foreground">
                  "{quote.text}"
                </p>
                <a
                  href={quote.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  r/{quote.subreddit}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </blockquote>
            ))}
          </div>
        </div>
      )}

      {report.topPosts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">热门帖子</h3>
          <div className="divide-y divide-border rounded-md border">
            {report.topPosts.map((post, index) => (
              <div key={index} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-1 text-sm font-medium hover:underline"
                  >
                    <span className="line-clamp-2">{post.title}</span>
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge variant="outline" className="px-1.5 py-0 text-xs">
                      r/{post.subreddit}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {post.upvotes.toLocaleString()} 赞
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {post.commentCount.toLocaleString()} 条评论
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.topDiscussionThreads.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">高互动讨论</h3>
          <div className="space-y-4">
            {report.topDiscussionThreads.map((thread, index) => (
              <Card key={index}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="px-1.5 py-0 text-xs">
                      r/{thread.subreddit}
                    </Badge>
                    <a
                      href={thread.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {thread.postTitle}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-md border p-3">
                    <p className="text-sm leading-relaxed">{thread.parentComment.text}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {thread.parentComment.author} ·{' '}
                      {thread.parentComment.upvotes.toLocaleString()} 赞
                    </p>
                  </div>

                  <div className="space-y-2">
                    {thread.replies.map((reply, replyIndex) => (
                      <div key={replyIndex} className="rounded-md bg-muted/40 p-3">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {reply.text}
                        </p>
                        <a
                          href={`https://www.reddit.com${reply.permalink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {reply.author} · {reply.upvotes.toLocaleString()} 赞
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
