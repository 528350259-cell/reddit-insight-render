import { useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TimeRange } from '../tracker.types';

const EXAMPLE_PROMPTS = [
  '开发者如何看待 AI 编程工具？',
  '科技行业用户如何看待远程办公？',
  '关于 React 最常见的吐槽是什么？',
];

interface PromptFormProps {
  onSubmit: (
    prompt: string,
    options: { subreddits?: string[]; timeRange?: TimeRange; maxPosts?: number },
  ) => void;
  onCancel?: () => void;
  isLoading: boolean;
}

export const PromptForm = ({ onSubmit, onCancel, isLoading }: PromptFormProps) => {
  const [prompt, setPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [subredditsInput, setSubredditsInput] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange | ''>('');
  const [maxPostsInput, setMaxPostsInput] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;

    const subreddits = subredditsInput
      .split(',')
      .map((item) => item.trim().replace(/^r\//i, ''))
      .filter(Boolean);

    const parsedMaxPosts = Number.parseInt(maxPostsInput, 10);
    const maxPosts =
      !Number.isNaN(parsedMaxPosts) && parsedMaxPosts >= 5 && parsedMaxPosts <= 100
        ? parsedMaxPosts
        : undefined;

    onSubmit(prompt.trim(), {
      subreddits: subreddits.length ? subreddits : undefined,
      timeRange: timeRange || undefined,
      maxPosts,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={EXAMPLE_PROMPTS[0]}
          rows={3}
          disabled={isLoading}
          aria-label="研究问题"
          className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {!prompt && !isLoading && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {showAdvanced ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          高级选项
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 rounded-md border border-border p-4">
            <div className="space-y-1.5">
              <Label htmlFor="subreddits" className="text-xs">
                指定社区（用英文逗号分隔）
              </Label>
              <Input
                id="subreddits"
                value={subredditsInput}
                onChange={(event) => setSubredditsInput(event.target.value)}
                placeholder="programming, MachineLearning, webdev"
                disabled={isLoading}
                className="h-8 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                填写的社区会参与抓取；留空则由 AI 推荐，并可在下一步继续增删。
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timeRange" className="text-xs">
                时间范围
              </Label>
              <Select
                value={timeRange}
                onValueChange={(value) => setTimeRange(value as TimeRange)}
                disabled={isLoading}
              >
                <SelectTrigger id="timeRange" className="h-8 text-sm">
                  <SelectValue placeholder="由 AI 推荐" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">过去 24 小时</SelectItem>
                  <SelectItem value="week">过去一周</SelectItem>
                  <SelectItem value="month">过去一个月</SelectItem>
                  <SelectItem value="year">过去一年</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maxPosts" className="text-xs">
                最多抓取帖子数（5 到 100，默认 30）
              </Label>
              <Input
                id="maxPosts"
                type="number"
                min={5}
                max={100}
                value={maxPostsInput}
                onChange={(event) => setMaxPostsInput(event.target.value)}
                placeholder="30"
                disabled={isLoading}
                className="h-8 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={!prompt.trim() || isLoading} className="flex-1">
          <Search className="mr-2 h-4 w-4" />
          {isLoading ? '正在生成分析计划...' : '开始分析 Reddit'}
        </Button>
        {isLoading && onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
};
