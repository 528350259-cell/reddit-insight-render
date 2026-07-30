import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteQueryMutation, useQueriesQuery } from '@/features/queries/api/useQueriesApi';

const PAGE_SIZE = 10;

export const Route = createFileRoute('/_layout/history')({
  component: HistoryPage,
});

const sentimentColor: Record<string, string> = {
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  negative: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  mixed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
};

function HistoryPage() {
  const { pathname } = useLocation();
  const { data: queries, isLoading } = useQueriesQuery();
  const deleteMutation = useDeleteQueryMutation();
  const [page, setPage] = useState(0);

  if (pathname !== '/history') {
    return <Outlet />;
  }

  if (isLoading) {
    return (
      <div className="py-6 space-y-4">
        <h1 className="text-2xl font-semibold">历史记录</h1>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">历史记录</h1>
        <p className="mt-1 text-sm text-muted-foreground">查看你之前跑过的 Reddit 话题分析</p>
      </div>

      {!queries?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">还没有查询记录</p>
            <p className="mt-1 text-xs text-muted-foreground">可以先去话题分析页跑第一条分析。</p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/tracker">前往话题分析</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {queries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((query) => (
              <Card
                key={query._id}
                className="group overflow-hidden transition-colors hover:bg-muted/30"
              >
                <CardContent className="flex items-center gap-2 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
                  <Clock className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                  <Link to="/history/$id" params={{ id: query._id }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{query.prompt}</p>
                    <div className="mt-1 min-w-0 space-y-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(query.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {query.report?.sentiment?.overall && (
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                              sentimentColor[query.report.sentiment.overall] ??
                              sentimentColor.neutral
                            }`}
                          >
                            {query.report.sentiment.overall}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {query.plan.subreddits.slice(0, 3).map((sub) => (
                          <Badge key={sub} variant="outline" className="px-1.5 py-0 text-xs">
                            r/{sub}
                          </Badge>
                        ))}
                        {query.plan.subreddits.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{query.plan.subreddits.length - 3} 个
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100 sm:opacity-0"
                    disabled={deleteMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      deleteMutation.mutate(query._id);
                    }}
                    aria-label="删除记录"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {queries.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                第 {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, queries.length)} 条， 共{' '}
                {queries.length} 条
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                  aria-label="上一页"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * PAGE_SIZE >= queries.length}
                  aria-label="下一页"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
