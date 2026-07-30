import { useState } from 'react';
import { ArrowLeft, Plus, X, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ScrapingPlan, TimeRange } from '../tracker.types';

interface PlanReviewProps {
  plan: ScrapingPlan;
  prompt: string;
  maxPosts?: number;
  onAnalyze: (plan: {
    prompt: string;
    subreddits: string[];
    queries: string[];
    timeRange: TimeRange;
    maxPosts?: number;
  }) => void;
  onBack: () => void;
  isLoading: boolean;
}

export const PlanReview = ({
  plan,
  prompt,
  maxPosts,
  onAnalyze,
  onBack,
  isLoading,
}: PlanReviewProps) => {
  const [subreddits, setSubreddits] = useState<string[]>(plan.subreddits);
  const [queries, setQueries] = useState<string[]>(plan.queries);
  const [timeRange, setTimeRange] = useState<TimeRange>(plan.timeRange);
  const [newSubreddit, setNewSubreddit] = useState('');

  const removeSubreddit = (subreddit: string) =>
    setSubreddits((current) => current.filter((item) => item !== subreddit));

  const addSubreddit = () => {
    const clean = newSubreddit.trim().replace(/^r\//i, '');
    if (clean && !subreddits.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      setSubreddits((current) => [...current, clean]);
    }
    setNewSubreddit('');
  };

  const updateQuery = (index: number, value: string) =>
    setQueries((current) =>
      current.map((query, queryIndex) => (queryIndex === index ? value : query)),
    );

  const removeQuery = (index: number) =>
    setQueries((current) => current.filter((_, queryIndex) => queryIndex !== index));

  const addQuery = () => setQueries((current) => [...current, '']);

  const handleSubmit = () => {
    const validQueries = queries.map((query) => query.trim()).filter(Boolean);
    if (!subreddits.length || !validQueries.length) return;
    onAnalyze({ prompt, subreddits, queries: validQueries, timeRange, maxPosts });
  };

  const canSubmit = !isLoading && subreddits.length > 0 && queries.some((query) => query.trim());

  return (
    <div className="space-y-6">
      {plan.rationale && (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-1 text-xs font-medium text-foreground">推荐理由</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{plan.rationale}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium">分析社区（{subreddits.length}）</Label>
        <p className="text-xs text-muted-foreground">
          可删除推荐社区，也可输入社区名后按回车或点击加号添加。
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {subreddits.map((subreddit) => (
            <Badge
              key={subreddit}
              variant="secondary"
              className="flex items-center gap-1 pr-1 text-sm"
            >
              r/{subreddit}
              <button
                type="button"
                onClick={() => removeSubreddit(subreddit)}
                disabled={isLoading}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 disabled:cursor-not-allowed"
                aria-label={`删除 r/${subreddit}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newSubreddit}
            onChange={(event) => setNewSubreddit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addSubreddit();
              }
            }}
            placeholder="添加社区，例如 AskReddit"
            disabled={isLoading}
            className="h-8 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSubreddit}
            disabled={!newSubreddit.trim() || isLoading}
            aria-label="添加社区"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">英文搜索词</Label>
        <p className="text-xs text-muted-foreground">
          搜索词用于 Reddit 检索。中文问题会由 AI 转换为贴近 Reddit 语境的英文表达，仍可手动修改。
        </p>
        <div className="space-y-2">
          {queries.map((query, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={query}
                onChange={(event) => updateQuery(index, event.target.value)}
                placeholder="输入英文搜索词"
                disabled={isLoading}
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeQuery(index)}
                disabled={queries.length <= 1 || isLoading}
                aria-label={`删除搜索词 ${index + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addQuery} disabled={isLoading}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          添加搜索词
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">时间范围</Label>
        <Select
          value={timeRange}
          onValueChange={(value) => setTimeRange(value as TimeRange)}
          disabled={isLoading}
        >
          <SelectTrigger className="h-8 w-full text-sm sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">过去 24 小时</SelectItem>
            <SelectItem value="week">过去一周</SelectItem>
            <SelectItem value="month">过去一个月</SelectItem>
            <SelectItem value="year">过去一年</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isLoading}
          className="w-full sm:w-auto"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
          <Zap className="mr-2 h-4 w-4" />
          {isLoading ? '正在抓取并分析...' : '按当前计划开始分析'}
        </Button>
      </div>
    </div>
  );
};
