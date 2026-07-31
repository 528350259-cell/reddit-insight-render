# Netlify 异步任务部署指南

该版本把“生成计划”和“抓取分析”都改成 Netlify Background Functions：

1. 普通 API 创建 MongoDB 任务并立即返回 `202`。
2. `analysis-background` 在后台执行，最长可运行 15 分钟。
3. 浏览器每 2 秒读取一次任务状态和进度。
4. 分析完成后，完整报告仍会写入历史记录。

## 必需环境变量

在 Netlify 的 **Project configuration > Environment variables** 中配置：

```text
MONGODB_URI=mongodb+srv://...
SCRAPING_PROVIDER=decodo
DECODO_BASIC_AUTH_TOKEN=...
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
APP_ACCESS_PASSWORD=团队访问口令
PUBLIC_APP_PASSWORD_REQUIRED=true
PUBLIC_API_BASE_URL=/api
```

`MONGODB_URI` 必须是公网可访问的 MongoDB 地址。本机 Docker 地址
`mongodb://localhost:27018/platform` 只能用于本地开发，Netlify 无法访问。

一般不需要设置 `NETLIFY_TASK_ORIGIN`。只有使用特殊反向代理或自定义域名导致后台
函数分发失败时，才把它设为站点根地址，例如：

```text
NETLIFY_TASK_ORIGIN=https://your-site.netlify.app
```

## 部署检查

推送 `main` 后，Netlify 应识别两个函数：

- `api`：创建任务、轮询状态、历史记录和设置接口。
- `analysis-background`：执行 Decodo 抓取和 DeepSeek 汇总。

先访问：

```text
https://your-site.netlify.app/api/healthz
```

应返回：

```json
{"ok":true,"service":"reddit-insight-netlify-api"}
```

随后在网页提交问题。正常流程会显示“任务已提交”，并逐步更新抓取、评论深挖、
AI 汇总和保存进度。

## 故障定位

在 Netlify 的 **Logs & Metrics > Functions** 分别查看：

- `api` 日志：MongoDB 连接、任务创建或轮询失败。
- `analysis-background` 日志：Decodo、DeepSeek、抓取超时或报告解析失败。

后台任务超过 15 分钟会被标记为失败。遇到这种情况，应减少社区、搜索词或帖子数，
而不是连续重复点击，以免产生重复的抓取和 LLM 费用。

生产分享前请轮换曾在聊天、截图或日志中暴露过的 API Key，并只把新 Key 放在
Netlify 环境变量中。
