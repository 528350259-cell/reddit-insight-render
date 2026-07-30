# Feishu / Lark 机器人完整接入手册

这份文档是给团队同事看的。

目标是让任意同事在自己的电脑上：

1. 跑起这个 Reddit 分析后端
2. 绑定到自己或团队的飞书机器人
3. 在飞书私聊或群聊里直接进行卡片交互

这份文档基于当前仓库实现，适用于本项目里的：

- `Decodo` 抓取
- `DeepSeek` 分析
- `Feishu / Lark` 长连接机器人
- 本地 `Docker Desktop + MongoDB + Redis`

---

## 1. 项目结构说明

当前和飞书机器人直接相关的核心位置：

- 后端配置：
  - [C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\apps\backend\src\shared\config\config.service.ts](C:/Users/Administrator/Documents/Codex/2026-06-10/reddit-app-github-decodo-reddit-scraper/Reddit-scraper-main/apps/backend/src/shared/config/config.service.ts)
- 飞书消息与卡片交互：
  - [C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\apps\backend\src\features\feishu\feishu.service.ts](C:/Users/Administrator/Documents/Codex/2026-06-10/reddit-app-github-decodo-reddit-scraper/Reddit-scraper-main/apps/backend/src/features/feishu/feishu.service.ts)
  - [C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\apps\backend\src\features\feishu\feishu.ws.service.ts](C:/Users/Administrator/Documents/Codex/2026-06-10/reddit-app-github-decodo-reddit-scraper/Reddit-scraper-main/apps/backend/src/features/feishu/feishu.ws.service.ts)
- 本地启动脚本：
  - [C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\scripts\dev-backend.ps1](C:/Users/Administrator/Documents/Codex/2026-06-10/reddit-app-github-decodo-reddit-scraper/Reddit-scraper-main/scripts/dev-backend.ps1)
  - [C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\scripts\check-bot.ps1](C:/Users/Administrator/Documents/Codex/2026-06-10/reddit-app-github-decodo-reddit-scraper/Reddit-scraper-main/scripts/check-bot.ps1)
  - [C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\scripts\install-autostart.ps1](C:/Users/Administrator/Documents/Codex/2026-06-10/reddit-app-github-decodo-reddit-scraper/Reddit-scraper-main/scripts/install-autostart.ps1)

---

## 2. 同事本地需要准备什么

每位同事本机至少需要：

- Windows Terminal 或 PowerShell
- `Bun`
- `Docker Desktop`
- 本仓库代码
- 一个可用的 `Decodo token`
- 一个可用的 `DeepSeek API Key`
- 一个已经创建好的飞书应用 `App ID / App Secret`

建议安装顺序：

1. 安装 `Bun`
2. 安装 `Docker Desktop`
3. `git clone` 本仓库
4. 复制 `.env.example` 为 `.env`
5. 填入自己的抓取、模型、飞书配置
6. 启动后端

---

## 3. 飞书开发者后台需要做什么

### 3.1 创建应用

到飞书开发者后台创建一个企业自建应用。

官方入口：

- [飞书开放平台](https://open.feishu.cn/)

建议创建类型：

- 企业自建应用
- 开启机器人能力

如果已经有现成应用，也可以直接复用，不必新建。

---

### 3.2 必须开启的能力

在应用后台，至少确认这些能力已经打开：

- 机器人能力
- 事件与回调
- 使用长连接接收事件

当前项目不是公网 webhook 模式，而是：

- 本地后端进程
- 通过飞书 SDK 建立长连接
- 飞书把消息事件推到本地进程

这意味着：

- 不需要公网服务器
- 不需要域名
- 不需要内网穿透
- 但本机必须在线，且后端必须在运行

官方参考：

- [使用长连接接收事件](https://open.feishu.cn/document/server-docs/event-subscription-guide/subscribe-to-events-using-long-connection)

---

### 3.3 必须开启的事件

当前项目核心依赖事件：

- `im.message.receive_v1`

这条事件负责：

- 私聊里收到用户发给机器人的消息
- 群聊里收到用户 `@` 机器人的消息

在飞书后台中，通常还要在该事件下打开对应的可读范围。

建议至少确认这些都开通：

- 读取用户发送给机器人的单聊消息
- 获取群聊中用户 `@` 机器人的消息
- 获取群聊中其他机器人和用户 `@` 当前机器人的消息

官方参考：

- [接收消息事件 `im.message.receive_v1`](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)

---

### 3.4 机器人发消息 / 发卡片所需能力

机器人要能把计划卡、结果卡回给用户，所以应用还需要具备消息发送能力。

建议确认：

- 机器人可以发送消息
- 机器人可以发送消息卡片

官方参考：

- [发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create)
- [发送飞书卡片](https://open.feishu.cn/document/feishu-cards/send-message-cards/send-message-cards)

---

### 3.5 卡片交互能力

当前项目的飞书交互不是纯文本，而是卡片交互，包括：

- 选择 subreddit
- 选择时间范围
- 切换结果视图
- 开始分析

所以应用必须允许卡片交互回调。

官方参考：

- [卡片回调通信](https://open.feishu.cn/document/feishu-cards/card-callback-communication)
- [开发卡片交互机器人](https://open.feishu.cn/document/feishu-cards/quick-start/develop-a-card-interactive-bot)

---

### 3.6 发布版本

在飞书后台改完配置后，记得：

- 保存
- 发布应用版本

如果没有发布，机器人经常会出现：

- 私聊能看到机器人
- 但收不到事件
- 或群聊里 `@` 没反应

---

## 4. 当前项目使用的环境变量

复制：

- [C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\.env.example](C:/Users/Administrator/Documents/Codex/2026-06-10/reddit-app-github-decodo-reddit-scraper/Reddit-scraper-main/.env.example)

为：

- `.env`

最小可用配置建议如下：

```env
# Backend
PORT=5002
PUBLIC_API_BASE_URL=http://localhost:5002
PUBLIC_FRONTEND_URL=http://localhost:5274

# Database
MONGO_PORT=27018
REDIS_PORT=6378
MONGODB_URI=mongodb://localhost:27018/platform

# Scraping
SCRAPING_PROVIDER=decodo
DECODO_BASIC_AUTH_TOKEN=你的_decodo_token

# LLM
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的_deepseek_key
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Feishu / Lark
FEISHU_ENABLED=true
FEISHU_APP_ID=你的_app_id
FEISHU_APP_SECRET=你的_app_secret
FEISHU_VERIFICATION_TOKEN=你的_verification_token
```

注意：

- `FEISHU_VERIFICATION_TOKEN` 虽然当前长连接主链路不靠公网 webhook，但项目里仍有校验逻辑，建议保持正确配置。
- `PUBLIC_FRONTEND_URL` 目前主要给历史报告或扩展用途保留，不是当前飞书机器人主流程的必须入口。

---

## 5. 本地第一次启动

在项目根目录执行：

```powershell
bun install
```

然后启动后端：

```powershell
bun run bot:backend
```

这条命令会自动做这些事：

- 检查 Docker Desktop
- 自动 `docker-compose up -d`
- 等待 MongoDB / Redis 端口就绪
- 清掉旧的后端进程
- 启动后端
- 建立飞书长连接

如果只想手工运行脚本，也可以：

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\scripts\dev-backend.ps1"
```

---

## 6. 如何验证机器人是否真的在线

推荐直接运行体检：

```powershell
bun run bot:check
```

这个脚本会检查：

- 计划任务状态
- Docker 是否 ready
- Mongo / Redis / 5002 端口
- `Settings API`
- `Queries API`
- 最近自启日志

体检脚本：

- [C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\scripts\check-bot.ps1](C:/Users/Administrator/Documents/Codex/2026-06-10/reddit-app-github-decodo-reddit-scraper/Reddit-scraper-main/scripts/check-bot.ps1)

---

## 7. 群聊和私聊的工作方式

### 私聊

私聊里直接发问题即可，例如：

- `Analyze pain points among hijab-wearing users on Reddit`
- `What real worries do people have when wearing wigs and headscarves?`

机器人会：

1. 返回计划卡
2. 允许选择社区 / 时间范围
3. 开始分析
4. 返回结果卡

### 群聊

群聊里需要 `@` 机器人，例如：

- `@机器人 Analyze pain points among hijab-wearing users on Reddit`

当前项目的群聊规则是：

- 卡片所有人可见
- 只有最初发起 `@` 的那个人能操作

这是为了避免群里其他人误点卡片按钮。

---

## 8. 当前卡片交互能力

目前已经支持：

- 生成计划卡
- 推荐 subreddits
- 选择 / 取消 subreddit
- 切换时间范围
- 添加搜索词
  - 点卡片里的 `添加搜索词`
  - 下一条消息直接输入搜索词
- 删除搜索词
- 开始分析
- 结果卡切换视图
  - `摘要`
  - `热门帖子`
  - `高互动讨论`

也就是说，同事即使不打开前端网页，也能在飞书里完成主要操作。

---

## 9. 开机自启

当前仓库已经支持 Windows 登录后自动拉起机器人后端。

安装自启：

```powershell
bun run autostart:install
```

卸载自启：

```powershell
bun run autostart:uninstall
```

当前实现方式：

- Windows 计划任务
- 登录后触发
- 自动启动 Docker Desktop
- 自动启动后端

相关文件：

- [C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\scripts\auto-start-backend.ps1](C:/Users/Administrator/Documents/Codex/2026-06-10/reddit-app-github-decodo-reddit-scraper/Reddit-scraper-main/scripts/auto-start-backend.ps1)
- [C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\scripts\run-autostart-backend.cmd](C:/Users/Administrator/Documents/Codex/2026-06-10/reddit-app-github-decodo-reddit-scraper/Reddit-scraper-main/scripts/run-autostart-backend.cmd)
- [C:\Users\Administrator\Documents\Codex\2026-06-10\reddit-app-github-decodo-reddit-scraper\Reddit-scraper-main\scripts\install-autostart.ps1](C:/Users/Administrator/Documents/Codex/2026-06-10/reddit-app-github-decodo-reddit-scraper/Reddit-scraper-main/scripts/install-autostart.ps1)

---

## 10. 常见问题排查

### 机器人私聊不回复

先看：

```powershell
bun run bot:check
```

重点确认：

- Docker Desktop 是 `ready`
- `5002` 在监听
- `Settings API: HTTP 200`

---

### 群里 `@` 机器人没反应

优先检查：

1. 飞书后台是否已发布最新版本
2. `im.message.receive_v1` 是否已开通
3. 群聊里 `@` 机器人时，事件权限是否覆盖群消息
4. 机器人是否真的已经被拉进该群

---

### 私聊能用，群聊不能点卡片

这是最容易碰到的场景之一。

检查项：

1. 当前操作者是不是最初 `@` 机器人的那个人
2. 是否是其他群成员在点击卡片

当前项目默认行为就是：

- 只有发起人能操作

---

### 后端起来了，但飞书还是没反应

优先检查 `.env` 里这三项：

- `FEISHU_ENABLED=true`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`

其次检查飞书版本是否已经发布。

---

## 11. 推荐交接流程

给同事最推荐的交接顺序是：

1. 先把本仓库拉到本地
2. 配好 `.env`
3. 配好自己的飞书应用
4. 执行：

```powershell
bun run bot:backend
```

5. 再执行：

```powershell
bun run bot:check
```

6. 最后去飞书私聊机器人测试一句话

等私聊通过，再测试群聊 `@`。

---

## 12. 官方文档参考

建议同事优先看这些官方文档：

- [使用长连接接收事件](https://open.feishu.cn/document/server-docs/event-subscription-guide/subscribe-to-events-using-long-connection)
- [接收消息事件 `im.message.receive_v1`](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)
- [发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create)
- [卡片回调通信](https://open.feishu.cn/document/feishu-cards/card-callback-communication)
- [开发卡片交互机器人](https://open.feishu.cn/document/feishu-cards/quick-start/develop-a-card-interactive-bot)
- [发送飞书卡片](https://open.feishu.cn/document/feishu-cards/send-message-cards/send-message-cards)

---

## 13. 当前项目的现实边界

这套方案的优点：

- 不需要公网服务器
- 不需要部署到云端
- 不需要内网穿透
- 飞书内即可完成大部分分析交互

这套方案的限制：

- 运行机器人那台电脑必须在线
- 后端必须在运行
- 抓取依赖 Decodo
- 分析依赖 DeepSeek
- 结果历史目前主要还是本地后端数据

如果后续要扩成团队长期共享版，再考虑：

- 云端部署
- 统一数据库
- 多人共用同一机器人实例
- 更完整的权限和审计

