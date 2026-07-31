import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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

interface AsyncTask<TResult> {
  id: string;
  kind: 'plan' | 'analyze';
  status: 'queued' | 'running' | 'completed' | 'failed';
  stage: string;
  progress: {
    completed?: number;
    total?: number;
    percent?: number;
    message?: string;
    detail?: string;
  };
  result?: TResult;
  error?: string;
}

export type ProgressState = {
  completed: number;
  total: number;
  percent: number;
  label: string;
  sublabel?: string;
};

const wait = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Polling cancelled', 'AbortError'));
      },
      { once: true },
    );
  });

async function submitAndPoll<TInput, TResult>(
  kind: 'plan' | 'analyze',
  input: TInput,
  onTask: (task: AsyncTask<TResult>) => void,
  signal: AbortSignal,
): Promise<TResult> {
  const { data: created } = await api.post<AsyncTask<TResult>>(
    `/tracker/tasks/${kind}`,
    input,
    { signal },
  );
  onTask(created);

  let transientFailures = 0;
  while (!signal.aborted) {
    await wait(2000, signal);
    let task: AsyncTask<TResult>;
    try {
      const response = await api.get<AsyncTask<TResult>>(`/tracker/tasks/${created.id}`, {
        signal,
      });
      task = response.data;
      transientFailures = 0;
    } catch (error) {
      if (signal.aborted) throw error;
      const status = (error as { response?: { status?: number } }).response?.status;
      const isColdStartError = status === 404 || status === 502 || status === 503 || status === 504;
      if (isColdStartError && transientFailures < 20) {
        transientFailures += 1;
        continue;
      }
      throw error;
    }

    onTask(task);

    if (task.status === 'completed') {
      if (!task.result) throw new Error('任务已完成，但服务端没有返回结果。');
      return task.result;
    }

    if (task.status === 'failed') {
      throw new Error(task.error || '后台任务执行失败，请稍后重试。');
    }
  }

  throw new DOMException('Polling cancelled', 'AbortError');
}

function useAsyncTaskMutation<TInput, TResult>(
  kind: 'plan' | 'analyze',
  onTask?: (task: AsyncTask<TResult>) => void,
) {
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsPending(false);
    setIsError(false);
    setError(null);
  }, []);

  const mutate = useCallback(
    (
      input: TInput,
      callbacks: {
        onSuccess?: (result: TResult) => void;
        onError?: (error: Error) => void;
      } = {},
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsPending(true);
      setIsError(false);
      setError(null);

      void submitAndPoll<TInput, TResult>(
        kind,
        input,
        (task) => onTask?.(task),
        controller.signal,
      )
        .then((result) => {
          if (controller.signal.aborted) return;
          setIsPending(false);
          callbacks.onSuccess?.(result);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          const taskError = caught instanceof Error ? caught : new Error(String(caught));
          setError(taskError);
          setIsError(true);
          setIsPending(false);
          callbacks.onError?.(taskError);
        });
    },
    [kind, onTask],
  );

  return { mutate, isPending, isError, error, reset };
}

export function useGeneratePlanMutation() {
  return useAsyncTaskMutation<GeneratePlanInput, ScrapingPlan>('plan');
}

export function useAnalyzePlanStream() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<ProgressState | null>(null);

  const handleTask = useCallback((task: AsyncTask<AnalyzeResult>) => {
    const taskProgress = task.progress ?? {};
    setProgress({
      completed: taskProgress.completed ?? 0,
      total: taskProgress.total ?? 100,
      percent: taskProgress.percent ?? (task.status === 'queued' ? 2 : 5),
      label:
        taskProgress.message ??
        (task.status === 'queued' ? '任务已提交，正在等待后台执行…' : '后台任务正在启动…'),
      sublabel: taskProgress.detail,
    });
  }, []);

  const {
    mutate: runTask,
    reset: resetTask,
    ...taskState
  } = useAsyncTaskMutation<AnalyzePlanInput, AnalyzeResult>(
    'analyze',
    handleTask,
  );

  const mutate = useCallback(
    (
      input: AnalyzePlanInput,
      callbacks: { onSuccess?: (result: AnalyzeResult) => void } = {},
    ) => {
      setProgress({
        completed: 0,
        total: 100,
        percent: 1,
        label: '正在创建后台分析任务…',
      });
      runTask(input, {
        onSuccess: (result) => {
          setProgress({
            completed: 100,
            total: 100,
            percent: 100,
            label: '分析已完成',
          });
          void queryClient.invalidateQueries({ queryKey: ['queries'] });
          callbacks.onSuccess?.(result);
        },
      });
    },
    [queryClient, runTask],
  );

  const reset = useCallback(() => {
    resetTask();
    setProgress(null);
  }, [resetTask]);

  return { ...taskState, mutate, progress, reset };
}
