# 市场信号页 —— TikHub + Dream Insight 自有店铺数据接入

**状态（2026-09-28）：代码已写完，build/lint 全部通过，已提 PR，等待 review + 部署配置。** 这份文档是备份入口——如果讨论这个功能的对话/会话丢失了，接手的人（或下一个 Claude session）应该从这份文档 + 下面列的真实验证结果直接继续，不需要重新调研。

## 目标

在现有的 Reddit 话题追踪之外，新增一个独立页面「市场信号」，把三类数据串成一条线：

1. **Reddit 痛点**（已有功能，`tracker` 模块产出的 `painPoints`/`themes`）
2. **TikHub 广谱市场数据**（TikTok Shop 全市场，按关键词搜索，含真实价格/销量/评分）
3. **Dream Insight 自有店铺数据**（另一个独立项目，已经打通 TikTok Shop 官方 API，见下）

用途：给一个研究关键词/痛点，能同时看到「市场上有没有对应爆品」+「我们自己有没有已经在卖类似的、卖得好不好」+「同类目竞品 GMV 量级参考」。

## 已确认的架构决策

- **两个系统打通方式**：reddit-insight-render 后端直接调用 Dream Insight 后端已有的只读诊断接口，不新增权限层，不碰 Dream Insight 的写路径。
- **Dream Insight 那边不需要改代码**——需要的接口已经存在并验证可用（见下）。
- **TikHub 数据每周更新一次**，不是实时调用。因为 reddit-insight-render 后端部署在 Netlify Functions（`apps/backend/src/netlify-handler.ts`），**没有常驻进程，不能用 setInterval/cron**。照搬 Dream Insight 那边已经验证过的模式：**GitHub Actions 定时工作流**调用一个受保护的 sync 接口，写入 MongoDB 缓存，页面只读缓存数据。
- **前端展示**：独立新页面，不揉进现有 Reddit 报告的字段里。

## Dream Insight 侧：已验证可用的真实接口

```
GET https://dream-creative-api-1.onrender.com/admin/tiktok/data
Headers: X-Admin-Token: <见下"凭证"一节，不要把明文提交进这个仓库>
Query params: source, limit, q（关键词过滤，匹配标题/名称）, include_raw
```

三个有用的 `source` 值（2026-09-27 实测过，返回真实数据，不是占位符）：

| source | 内容 | 关键字段 | 备注 |
|---|---|---|---|
| `products` | 我们自己店铺的商品目录 | `title`, `dimensions.skus[].price`, `dimensions.categories[]`, `dimensions.status`(DRAFT/PUBLISHED), `dimensions.product_url` | `entity_id` = product_id，可跟 `shop_products` 联立 |
| `shop_products` | 我们自己商品的真实经营表现 | `metrics.gmv`, `metrics.orders`, `metrics.product_impressions`, `metrics.ctr`, `metrics.add_cart_rate` 等完整漏斗 | **这份数据本身不带商品名**（`dimensions.product_name` 是空字符串），必须用 `entity_id` 去 `products` 源反查名字 |
| `bestsellers` | 市场热销榜（按类目，非我们自己） | `metrics.gmv_range`, `metrics.rank`, `metrics.rating`, `metrics.shop_name`, `dimensions.filter_category_name` | 已验证 `q=wig` 能筛出 UNice/Dachic Hair/CurlyMe 等真实竞品，7天GMV区间普遍在 $2万~$4.6万 美元量级 |

已知同步过的三个类目：Beauty & Personal Care(601450)、Fashion Accessories(605248，几乎全是假发相关)、Toys & Hobbies(604206)。

当前数据量（2026-09-27 实测 `summary.by_source`）：shop_videos 79729 / shop_products 289 / products 1248 / categories 2074 / bestsellers 14600。

## TikHub 侧：已验证可用的真实接口

```
GET https://api.tikhub.io/api/v1/tiktok/shop/web/fetch_search_products_list
Headers: Authorization: Bearer <TikHub API Key>
Query params: search_word（必填）, offset（默认0，分页）, region（US/SG/MY/PH/TH/VN/ID/JP/MX）
```

返回结构（每页30条）：`data.products[]`，每条含 `title`, `product_price_info.sale_price_format`, `rate_info.score`/`review_count`, `sold_info.sold_count`, `seller_info.shop_name`, `seo_url.canonical_url`。已实测搜索 "wig grip"、"half wig accessory"、"drawstring wig cap replacement" 三个关键词，数据真实可信（比如某"3 In 1 Half Wig...Drawstring...Flip Headband"单品卖了2957件，验证了"结构重组+精准人群"打法有效）。

**权限注意**：TikHub 的 API Token 需要在 https://user.tikhub.io/dashboard/api 里手动勾选开通 `TikTok-Shop-Web-API` 这个 scope，否则调用会 403（不是 401，key 本身有效，只是没开权限）。

## 已实现的代码改动（reddit-insight-render 仓库内，分支 `feature/market-signals-tikhub-dream-insight`）

仿照现有 `apps/backend/src/features/decodo/` 模块的写法：

1. `apps/backend/src/features/tikhub/`：`tikhub.service.ts`（封装 TikHub 搜索接口）+ `tikhub-sync.service.ts`（关键词管理 + 同步编排）+ `tikhub.types.ts` + `tracked-keyword.schema.ts` + `tikhub-snapshot.schema.ts` + `tikhub.controller.ts` + `tikhub.module.ts`
2. `apps/backend/src/features/dream-insight/`：`dream-insight.service.ts`（薄代理，调用 `/admin/tiktok/data`，实现了 `findOwnProductMatches`/`findBestsellerMatches` 两个联立查询）+ `dream-insight.types.ts` + `dream-insight.module.ts`
3. `apps/backend/src/features/market-signals/`：把上面两个模块的数据聚合成一个响应
4. `ConfigService` 新增了 `tikhub`/`dreamInsight` 两个 getter，读取 `TIKHUB_API_KEY`、`TIKHUB_SYNC_TOKEN`、`DREAM_INSIGHT_API_BASE_URL`、`DREAM_INSIGHT_ADMIN_TOKEN`
5. `.github/workflows/weekly-tikhub-sync.yml`：每周一 09:00(UTC+8) 调用 `/admin/tikhub/sync`，仿照 Dream Insight 的 `daily-tiktok-sync.yml` 写法。**GitHub repo secret `TIKHUB_SYNC_TOKEN` 已经用 `gh secret set` 配好了**
6. `GET /market-signals?keyword=`：聚合 TikHub 缓存数据 + 实时代理 Dream Insight 数据
7. 前端：新增 `/market-signals` 路由页面 + 侧边栏"市场信号"入口，含关键词管理（增/删）+ 三张结果表（TikHub广谱/自有商品/竞品热销榜）

**⚠️ 关键架构坑，踩过一次记录下来**：reddit-insight-render 部署在 Netlify 上时，生产环境**不是**走标准 NestJS controller 自动路由的——`apps/backend/src/netlify-handler.ts` 是一份手写的路由分发器，手动 `new` 各个 service、手动 match path，完全绕开 `@Controller` 装饰器。本地 `nest start` 能跑的 controller，**不加到这份文件里，线上永远 404**。这次已经把 tikhub/market-signals 相关路由和 `/admin/tikhub/sync` 的 sync-token 校验都补进了 `netlify-handler.ts`，以后再给这几个 feature 加新接口，别忘了同步改这里。

**另一个坑**：`apps/frontend` 的 `bun run build` 脚本是 `tsc --noEmit && rsbuild build`——如果新增了路由文件但 `routeTree.gen.ts` 还没重新生成（这个文件是 `@tanstack/router-plugin` 在 `rsbuild build`/`rsbuild dev` 时自动生成的），`tsc` 会先挂掉。解决方法：先单独跑一次 `bunx rsbuild build`（或 `bunx rsbuild dev`）让插件把 `routeTree.gen.ts` 重新生成，再跑完整的 `bun run build`。

**前端没有"立即同步"按钮**：`POST /admin/tikhub/sync` 需要 `X-Sync-Token`，这个值故意不下发给浏览器（只有 GitHub Actions 知道），所以手动触发同步只能通过 GitHub Actions 页面的 "Run workflow" 按钮（workflow 里配了 `workflow_dispatch`），前端页面只能管理关键词列表 + 查看已同步的结果，这是有意的安全设计，不是漏做了。

## 需要的凭证（值不要写进这个仓库/任何提交里）

**这个仓库是公开仓库，下面这些值本身绝不能出现在任何提交里** — 已用真实调用验证过都可用，实际值只存在于本机 gitignored 的 `.env` 里：

- Dream Insight `X-Admin-Token`：用户在对话里给过，本地 `.env` 已配好，Netlify 生产环境待用户自己去后台加同名环境变量
- TikHub API Key：已验证可用（已开通 `TikTok-Shop-Web-API` scope），本地 `.env` 已配好，Netlify 生产环境待配
- `TIKHUB_SYNC_TOKEN`：随机生成的一个新令牌，**已经用 `gh secret set` 配进了 GitHub repo secrets**（只有 Actions 运行时能读到，仓库里看不到明文），本地 `.env` 也同步配了同一个值；Netlify 生产环境同样需要用户手动加这个环境变量（值必须和 GitHub secret 里的一致，否则 Actions 触发的同步会 401）

## 用户仍需手动做的事

1. 去 Netlify 后台（这个项目的 Site settings → Environment variables）加四个变量：`TIKHUB_API_KEY`、`TIKHUB_SYNC_TOKEN`（值见上，问 Claude 要或者重新生成一个然后同步更新 GitHub secret）、`DREAM_INSIGHT_API_BASE_URL`、`DREAM_INSIGHT_ADMIN_TOKEN`——配好后触发一次 Netlify 重新部署才会生效
2. Review 并合并分支 `feature/market-signals-tikhub-dream-insight` 的 PR
3. 部署后先去 `/market-signals` 页面加一两个关键词，然后去 GitHub Actions 页面手动 "Run workflow" 跑一次 `Weekly TikHub market sync`，确认能跑通、Mongo 里真的写进了 `tikhub_snapshots` collection，再放心让它每周自动跑

## 下一步（如果还要继续迭代）

当前版本是最小可用版本：关键词管理 + 三张结果表堆叠展示，没有做进一步的智能排序/预警（比如"这个关键词销量暴涨但我们没有对应商品"自动高亮）。如果用户觉得数据有用，可以再迭代：把这个页面和 Reddit 洞察的痛点关键词联动起来（比如从话题分析报告里一键把高频词发送到市场信号页查询）。
