import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { AlertTriangle, CheckCircle, Circle, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSettingsQuery,
  useUpdateSettingsMutation,
} from '@/features/settings/api/useSettingsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute('/_layout/settings')({
  component: SettingsPage,
});

type Provider = 'claude' | 'openai' | 'gemini' | 'deepseek';
type ScrapingProvider = 'decodo' | 'reddit-direct';

const PROVIDER_LABELS: Record<Provider, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'GPT (OpenAI)',
  gemini: 'Gemini (Google)',
  deepseek: 'DeepSeek',
};

const PROVIDER_DEFAULT_MODELS: Record<Provider, string> = {
  claude: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
  deepseek: 'deepseek-v4-flash',
};

const SCRAPING_PROVIDER_LABELS: Record<ScrapingProvider, string> = {
  'reddit-direct': 'Reddit 直连',
  decodo: 'Decodo',
};

const KeyRow = ({
  label,
  isSet,
  isLoading,
}: {
  label: string;
  isSet?: boolean;
  isLoading: boolean;
}) => (
  <div className="flex items-center justify-between py-2">
    <span className="text-sm">{label}</span>
    {isLoading ? (
      <Skeleton className="h-4 w-20" />
    ) : isSet ? (
      <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <CheckCircle className="h-3.5 w-3.5" />
        已配置
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Circle className="h-3.5 w-3.5" />
        未设置
      </span>
    )}
  </div>
);

function SettingsPage() {
  const { data: status, isLoading } = useSettingsQuery();
  const updateMutation = useUpdateSettingsMutation();

  const [provider, setProvider] = useState<Provider>('claude');
  const [scrapingProvider, setScrapingProvider] = useState<ScrapingProvider>('reddit-direct');
  const [model, setModel] = useState('');
  const [syncedStatus, setSyncedStatus] = useState<typeof status | null>(null);

  if (status && status !== syncedStatus) {
    setSyncedStatus(status);
    setProvider((status.provider as Provider) || 'claude');
    setScrapingProvider(status.scrapingProvider || 'reddit-direct');
    setModel(status.model || '');
  }

  const llmKeySet =
    provider === 'openai'
      ? status?.openaiKeySet
      : provider === 'gemini'
        ? status?.geminiKeySet
        : provider === 'deepseek'
          ? status?.deepseekKeySet
          : status?.anthropicKeySet;

  const missingDecodo =
    !isLoading && status && scrapingProvider === 'decodo' && !status.decodoKeySet;
  const missingLlmKey = !isLoading && status && !llmKeySet;

  const isDirty =
    status !== undefined &&
    (provider !== status.provider ||
      scrapingProvider !== status.scrapingProvider ||
      model !== (status.model ?? ''));

  const handleSave = () => {
    updateMutation.mutate(
      { provider, scrapingProvider, model },
      {
        onSuccess: () => toast.success('设置已保存'),
        onError: () => toast.error('保存设置失败'),
      },
    );
  };

  return (
    <div className="max-w-xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          选择你的 LLM 和抓取来源。API key 通过服务端的 <code className="font-mono">.env</code>{' '}
          配置。
        </p>
      </div>

      {(missingDecodo || missingLlmKey) && (
        <div className="space-y-2">
          {missingDecodo && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2.5 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                你的 <code className="font-mono">.env</code> 里还没有设置{' '}
                <code className="font-mono">DECODO_BASIC_AUTH_TOKEN</code>，抓取将无法工作。
              </span>
            </div>
          )}
          {missingLlmKey && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2.5 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                当前没有检测到 <code className="font-mono">{provider}</code> 的 API key，请把{' '}
                <code className="font-mono">
                  {provider === 'openai'
                    ? 'OPENAI_API_KEY'
                    : provider === 'gemini'
                      ? 'GEMINI_API_KEY'
                      : provider === 'deepseek'
                        ? 'DEEPSEEK_API_KEY'
                        : 'ANTHROPIC_API_KEY'}
                </code>{' '}
                写入 <code className="font-mono">.env</code>。
              </span>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">抓取来源</CardTitle>
          <CardDescription>在 Reddit 直连 JSON 抓取和 Decodo 抓取之间切换。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="scraping-provider">来源</Label>
            <Select
              value={scrapingProvider}
              onValueChange={(v) => setScrapingProvider(v as ScrapingProvider)}
              disabled={isLoading}
            >
              <SelectTrigger id="scraping-provider" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(SCRAPING_PROVIDER_LABELS) as [ScrapingProvider, string][]).map(
                  ([key, label]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        {label}
                        {key === 'decodo' && status?.decodoKeySet && (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        )}
                      </span>
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LLM 提供方</CardTitle>
          <CardDescription>
            选择要使用的模型提供方。只需要配置当前选中提供方的 key。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="provider">提供方</Label>
            <Select
              value={provider}
              onValueChange={(v) => {
                setProvider(v as Provider);
                setModel('');
              }}
              disabled={isLoading}
            >
              <SelectTrigger id="provider" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(PROVIDER_LABELS) as [Provider, string][]).map(([key, label]) => {
                  const keySet =
                    key === 'openai'
                      ? status?.openaiKeySet
                      : key === 'gemini'
                        ? status?.geminiKeySet
                        : key === 'deepseek'
                          ? status?.deepseekKeySet
                          : status?.anthropicKeySet;
                  return (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        {label}
                        {keySet && <CheckCircle className="h-3 w-3 text-green-500" />}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model">模型覆盖</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={`默认值: ${PROVIDER_DEFAULT_MODELS[provider]}`}
              disabled={isLoading}
              className="w-full sm:max-w-xs"
            />
            <p className="text-xs text-muted-foreground">留空时会使用当前提供方的默认模型。</p>
          </div>

          <Button
            onClick={handleSave}
            disabled={!isDirty || updateMutation.isPending || isLoading}
            size="sm"
            className="w-full sm:w-auto"
          >
            <Save className="mr-2 h-3.5 w-3.5" />
            {updateMutation.isPending ? '保存中…' : '保存'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Keys</CardTitle>
          <CardDescription>
            通过 <code className="font-mono text-xs">.env</code> 环境变量设置，不会写入数据库。
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <KeyRow
            label="Anthropic API key (ANTHROPIC_API_KEY)"
            isSet={status?.anthropicKeySet}
            isLoading={isLoading}
          />
          <KeyRow
            label="OpenAI API key (OPENAI_API_KEY)"
            isSet={status?.openaiKeySet}
            isLoading={isLoading}
          />
          <KeyRow
            label="Gemini API key (GEMINI_API_KEY)"
            isSet={status?.geminiKeySet}
            isLoading={isLoading}
          />
          <KeyRow
            label="DeepSeek API key (DEEPSEEK_API_KEY)"
            isSet={status?.deepseekKeySet}
            isLoading={isLoading}
          />
          <KeyRow
            label="Decodo token (DECODO_BASIC_AUTH_TOKEN)"
            isSet={status?.decodoKeySet}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
