import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PromptForm } from '@/features/tracker/components/PromptForm';
import { PlanReview } from '@/features/tracker/components/PlanReview';
import { ReportView } from '@/features/tracker/components/ReportView';
import { MiniGame } from '@/features/tracker/components/MiniGame';
import {
  useAnalyzePlanStream,
  useGeneratePlanMutation,
} from '@/features/tracker/api/useTrackerApi';
import type { ProgressState } from '@/features/tracker/api/useTrackerApi';
import { exportAsJson, exportAsMarkdown } from '@/features/tracker/utils/export';
import type { AnalyzeResult, ScrapingPlan, TimeRange } from '@/features/tracker/tracker.types';

export const Route = createFileRoute('/_layout/tracker')({
  component: TrackerPage,
});

type Step =
  | { stage: 'input' }
  | { stage: 'reviewing'; plan: ScrapingPlan; prompt: string; maxPosts?: number }
  | { stage: 'done'; result: AnalyzeResult; prompt: string };

const AnalyzingState = ({
  progress,
  onCancel,
}: {
  progress: ProgressState | null;
  onCancel: () => void;
}) => {
  const showBar = progress !== null && progress.total > 0 && progress.completed < progress.total;

  return (
    <div className="space-y-5 py-2">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="truncate text-sm text-muted-foreground">
              {progress?.label ?? '正在抓取 Reddit 并生成报告...'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onCancel} className="shrink-0">
            取消
          </Button>
        </div>
        <p
          className={`truncate pl-7 text-xs text-muted-foreground ${progress?.sublabel ? '' : 'invisible'}`}
        >
          {progress?.sublabel ?? '正在准备数据'}
        </p>
      </div>
      <div className="space-y-1" style={{ visibility: showBar ? 'visible' : 'hidden' }}>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{
              width: `${progress && progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
            }}
          />
        </div>
        <p className="text-right text-xs text-muted-foreground">
          {progress && progress.total > 0
            ? Math.round((progress.completed / progress.total) * 100)
            : 0}
          %
        </p>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-12 animate-pulse rounded-md bg-muted"
            style={{ animationDelay: `${index * 150}ms` }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        通常需要 10 至 30 秒，具体取决于社区数量、帖子数量和评论深度。
      </p>
    </div>
  );
};

const getApiError = (error: unknown): string | undefined =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
  (error as Error)?.message;

const isApiKeyLikely = (message: string | undefined): boolean =>
  !!message && /api[_ -]?key|unauthori[sz]ed|forbidden|401|403/i.test(message);

const ErrorMessage = ({ message, error }: { message: string; error?: unknown }) => {
  const apiMessage = getApiError(error);
  return (
    <div className="mt-4 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <p className="font-medium">{apiMessage ?? message}</p>
      {apiMessage && <p className="opacity-80">{message}</p>}
      {isApiKeyLikely(apiMessage) && (
        <p>
          <Link to="/settings" className="font-medium underline underline-offset-2">
            检查 API Key 设置
          </Link>
        </p>
      )}
    </div>
  );
};

function TrackerPage() {
  const [step, setStep] = useState<Step>({ stage: 'input' });
  const generatePlan = useGeneratePlanMutation();
  const analyzePlan = useAnalyzePlanStream();

  const handlePromptSubmit = (
    prompt: string,
    options: { subreddits?: string[]; timeRange?: TimeRange; maxPosts?: number },
  ) => {
    const { maxPosts, ...planOptions } = options;
    generatePlan.mutate(
      { prompt, ...planOptions },
      {
        onSuccess: (plan) => {
          setStep({ stage: 'reviewing', plan, prompt, maxPosts });
        },
      },
    );
  };

  const handleAnalyze = (planInput: {
    prompt: string;
    subreddits: string[];
    queries: string[];
    timeRange: TimeRange;
    maxPosts?: number;
  }) => {
    analyzePlan.mutate(planInput, {
      onSuccess: (result) => {
        setStep({ stage: 'done', result, prompt: planInput.prompt });
      },
    });
  };

  const reset = () => {
    setStep({ stage: 'input' });
    generatePlan.reset();
    analyzePlan.reset();
  };

  const stepLabel = {
    input: '第 1 步，共 3 步：输入研究问题',
    reviewing: analyzePlan.isPending ? '正在分析...' : '第 2 步，共 3 步：确认抓取计划',
    done: '第 3 步，共 3 步：查看分析报告',
  }[step.stage];

  const cardTitle = {
    input: '你想研究什么？',
    reviewing: analyzePlan.isPending ? '正在分析...' : '抓取与分析计划',
    done: '分析报告',
  }[step.stage];

  return (
    <div className="py-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Reddit 话题分析</h1>
            <p className="mt-1 text-sm text-muted-foreground">{stepLabel}</p>
          </div>
          {step.stage !== 'input' && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              重新开始
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">{cardTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {step.stage === 'input' && (
              <>
                <PromptForm
                  onSubmit={handlePromptSubmit}
                  onCancel={generatePlan.reset}
                  isLoading={generatePlan.isPending}
                />
                {generatePlan.isError && (
                  <ErrorMessage message="生成抓取计划失败。" error={generatePlan.error} />
                )}
              </>
            )}

            {step.stage === 'reviewing' &&
              (analyzePlan.isPending ? (
                <AnalyzingState progress={analyzePlan.progress} onCancel={analyzePlan.reset} />
              ) : (
                <>
                  <PlanReview
                    plan={step.plan}
                    prompt={step.prompt}
                    maxPosts={step.maxPosts}
                    onAnalyze={handleAnalyze}
                    onBack={reset}
                    isLoading={false}
                  />
                  {analyzePlan.isError && (
                    <ErrorMessage message="分析失败。" error={analyzePlan.error} />
                  )}
                </>
              ))}

            {step.stage === 'done' && (
              <ReportView
                prompt={step.prompt}
                report={step.result.report}
                onExportMarkdown={() => exportAsMarkdown(step.prompt, step.result.report)}
                onExportJson={() => exportAsJson(step.result)}
              />
            )}
          </CardContent>
        </Card>

        {step.stage === 'reviewing' && analyzePlan.isPending && <MiniGame />}

        {step.stage === 'input' && !generatePlan.isPending && (
          <p className="text-center text-xs text-muted-foreground">
            需要先配置 API Key？
            <Link to="/settings" className="ml-1 underline underline-offset-2">
              前往设置
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
