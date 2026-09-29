import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { isAxiosError } from 'axios';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAddKeywordMutation,
  useMarketSignalsQuery,
  useRemoveKeywordMutation,
  useTrackedKeywordsQuery,
  type TikhubRegion,
} from '@/features/market-signals/api/useMarketSignalsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute('/_layout/market-signals')({
  component: MarketSignalsPage,
});

const REGIONS: TikhubRegion[] = ['US', 'SG', 'MY', 'PH', 'TH', 'VN', 'ID', 'JP', 'MX'];

function KeywordManager() {
  const { data: keywords, isLoading } = useTrackedKeywordsQuery();
  const addMutation = useAddKeywordMutation();
  const removeMutation = useRemoveKeywordMutation();

  const [keyword, setKeyword] = useState('');
  const [region, setRegion] = useState<TikhubRegion>('US');

  const handleAdd = () => {
    if (!keyword.trim()) return;
    addMutation.mutate(
      { keyword: keyword.trim(), region },
      {
        onSuccess: () => {
          toast.success(`已加入追踪：${keyword.trim()} (${region})`);
          setKeyword('');
        },
        onError: (err: unknown) => {
          const message = isAxiosError<{ message?: string }>(err)
            ? err.response?.data?.message
            : undefined;
          toast.error(message ?? '添加失败');
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">追踪的关键词</CardTitle>
        <CardDescription>
          这里管理的关键词由每周一的 GitHub Actions 定时任务同步 TikHub 数据（不是实时调用）。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-keyword">关键词</Label>
            <Input
              id="new-keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例如：wig grip"
              className="w-56"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-region">地区</Label>
            <Select value={region} onValueChange={(v) => setRegion(v as TikhubRegion)}>
              <SelectTrigger id="new-region" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={addMutation.isPending || !keyword.trim()} size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            添加
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !keywords?.length ? (
          <p className="text-sm text-muted-foreground">还没有追踪任何关键词。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {keywords.map((k) => (
              <Badge key={k._id} variant="secondary" className="flex items-center gap-1.5 py-1.5">
                {k.keyword}
                <span className="text-muted-foreground">({k.region})</span>
                <button
                  onClick={() => removeMutation.mutate(k._id)}
                  disabled={removeMutation.isPending}
                  aria-label={`移除 ${k.keyword}`}
                >
                  <Trash2 className="h-3 w-3 hover:text-destructive" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TikhubResultsCard({ keyword }: { keyword: string }) {
  const { data, isLoading, isError } = useMarketSignalsQuery(keyword);

  if (!keyword.trim()) return null;
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) {
    return <p className="text-sm text-destructive">查询失败，请稍后重试。</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            TikHub 广谱市场结果
            {!data.isTracked && (
              <Badge variant="outline" className="ml-2">
                未追踪 — 请先在上方添加此关键词并等待下一次同步
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {data.tikhub.fetchedAt
              ? `上次同步：${new Date(data.tikhub.fetchedAt).toLocaleString('zh-CN')}`
              : '暂无缓存数据'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.tikhub.products.length === 0 ? (
            <p className="text-sm text-muted-foreground">没有数据。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品</TableHead>
                  <TableHead>价格</TableHead>
                  <TableHead>销量</TableHead>
                  <TableHead>评分</TableHead>
                  <TableHead>店铺</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tikhub.products.map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell className="max-w-xs truncate" title={p.title}>
                      {p.title}
                    </TableCell>
                    <TableCell>${p.priceFormat}</TableCell>
                    <TableCell>{p.soldCount}</TableCell>
                    <TableCell>
                      {p.ratingScore.toFixed(1)} ({p.reviewCount})
                    </TableCell>
                    <TableCell>{p.shopName}</TableCell>
                    <TableCell>
                      {p.productUrl && (
                        <a href={p.productUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">我们自己的商品</CardTitle>
          <CardDescription>
            来自 Dream Insight 已同步的自有店铺目录 + 真实经营数据。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.ownShop.length === 0 ? (
            <p className="text-sm text-muted-foreground">我们目前没有匹配这个关键词的在售商品。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>售价</TableHead>
                  <TableHead>曝光</TableHead>
                  <TableHead>点击</TableHead>
                  <TableHead>订单</TableHead>
                  <TableHead>GMV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ownShop.map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell className="max-w-xs truncate" title={p.title}>
                      {p.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'PUBLISHED' ? 'default' : 'outline'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>${p.priceUsd}</TableCell>
                    <TableCell>{p.performance?.productImpressions ?? '—'}</TableCell>
                    <TableCell>{p.performance?.productClicks ?? '—'}</TableCell>
                    <TableCell>{p.performance?.orders ?? '—'}</TableCell>
                    <TableCell>${p.performance?.gmvUsd ?? '0.00'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">同类目竞品热销榜</CardTitle>
          <CardDescription>市场整体数据，非我们自己的店铺。</CardDescription>
        </CardHeader>
        <CardContent>
          {data.marketBestsellers.length === 0 ? (
            <p className="text-sm text-muted-foreground">没有匹配的热销商品。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>排名</TableHead>
                  <TableHead>商品</TableHead>
                  <TableHead>GMV 区间</TableHead>
                  <TableHead>评分</TableHead>
                  <TableHead>店铺</TableHead>
                  <TableHead>类目</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.marketBestsellers.map((b, i) => (
                  <TableRow key={i}>
                    <TableCell>#{b.rank}</TableCell>
                    <TableCell className="max-w-xs truncate" title={b.productName}>
                      {b.productName}
                    </TableCell>
                    <TableCell>{b.gmvRange}</TableCell>
                    <TableCell>{b.rating}</TableCell>
                    <TableCell>{b.shopName}</TableCell>
                    <TableCell>{b.categoryName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MarketSignalsPage() {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeKeyword, setActiveKeyword] = useState('');

  return (
    <div className="max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold">市场信号</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按关键词把 TikHub 广谱市场数据 + 我们自己店铺的真实经营数据 + 同类目竞品热销榜串成一条线。
        </p>
      </div>

      <KeywordManager />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">查询</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="search-keyword">关键词</Label>
              <Input
                id="search-keyword"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="例如：wig grip"
                onKeyDown={(e) => e.key === 'Enter' && setActiveKeyword(searchKeyword)}
              />
            </div>
            <Button
              onClick={() => setActiveKeyword(searchKeyword)}
              disabled={!searchKeyword.trim()}
            >
              查询
            </Button>
          </div>
        </CardContent>
      </Card>

      <TikhubResultsCard keyword={activeKeyword} />
    </div>
  );
}
