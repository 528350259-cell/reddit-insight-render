import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AnalyzeResult, ScrapingPlan, TimeRange } from '../tracker.types';

interface GeneratePlanInput {
  prompt: string;
  subreddits?: string[];
  timeRange?: TimeRange;
}

interface AnalyzePlanInput {
  prompt: string;
  subreddits: string[];
  queries: string[];
  timeRange: TimeRange;
  maxPosts?: number;
}

type ProgressEvent =
  | { type: 'started'; totalTasks: number; queries: number; subreddits: number }
  | { type: 'task_complete'; completed: number; total: number; label: string }
  | { type: 'deep_diving'; posts: number }
  | { type: 'summarizing' }
  | { type: 'saving' };

export type ProgressState = {
  completed: number;
  total: number;
  label: string;
  sublabel?: string;
};

const generatePlan = async (dto: GeneratePlanInput): Promise<ScrapingPlan> => {
  const { data } = await api.post<ScrapingPlan>('/tracker/plan', dto);
  return data;
};

export const useGeneratePlanMutation = () => useMutation({ mutationFn: generatePlan });

async function analyzePlanRequest(
  dto: AnalyzePlanInput,
  onProgress: (event: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<AnalyzeResult> {
  onProgress({
    type: 'started',
    totalTasks: dto.queries.length + dto.subreddits.length,
    queries: dto.queries.length,
    subreddits: dto.subreddits.length,
  });

  const { data } = await api.post<AnalyzeResult>('/tracker/analyze', dto, { signal });
  return data;
}

export function useAnalyzePlanStream() {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const mutate = useCallback(
    (dto: AnalyzePlanInput, callbacks: { onSuccess?: (result: AnalyzeResult) => void } = {}) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setIsPending(true);
      setIsError(false);
      setError(null);
      setProgress({ completed: 0, total: 0, label: '正在连接分析服务...' });

      analyzePlanRequest(
        dto,
        (event) => {
          if (event.type === 'started') {
            setProgress({
              completed: 0,
              total: event.totalTasks,
              label: '正在抓取 Reddit 并生成报告...',
              sublabel: 'Netlify 免费版使用普通请求模式，进度不会逐条实时刷新。',
            });
          } else if (event.type === 'task_complete') {
            setProgress({
              completed: event.completed,
              total: event.total,
              label: `已抓取 ${event.completed} / ${event.total} 个来源`,
              sublabel: event.label,
            });
          } else if (event.type === 'deep_diving') {
            setProgress((p) => ({
              ...p!,
              label: `正在深挖 ${event.posts} 个评论楼层...`,
              sublabel: undefined,
            }));
          } else if (event.type === 'summarizing') {
            setProgress((p) => ({
              ...p!,
              label: '正在生成 AI 报告...',
              sublabel: undefined,
            }));
          } else if (event.type === 'saving') {
            setProgress((p) => ({ ...p!, label: '正在保存到历史记录...', sublabel: undefined }));
          }
        },
        ac.signal,
      )
        .then((result) => {
          setIsPending(false);
          void queryClient.invalidateQueries({ queryKey: ['queries'] });
          callbacks.onSuccess?.(result);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsError(true);
          setIsPending(false);
        });
    },
    [queryClient],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsPending(false);
    setIsError(false);
    setError(null);
    setProgress(null);
  }, []);

  return { mutate, isPending, isError, error, progress, reset };
}
