# Render 部署指南

这个项目推荐先用 Render 免费版部署成团队可访问的网页端：

- `reddit-insight-api`：Nest 后端 Web Service。
- `reddit-insight-web`：React 前端 Static Site。
- `MongoDB Atlas`：免费云数据库，保存历史记录。

## 1. 准备 MongoDB Atlas

1. 创建免费 Atlas 集群。
2. 创建数据库用户。
3. Network Access 先允许 `0.0.0.0/0`，后续稳定后再收紧。
4. 复制连接串，格式类似：

```text
mongodb+srv://USER:PASSWORD@cluster.mongodb.net/platform?retryWrites=true&w=majority
```

## 2. 推到 GitHub

Render Blueprint 需要从 GitHub 仓库读取 `render.yaml`。

如果你当前目录还不是 Git 仓库，可以在 `Reddit-scraper-main` 下执行：

```powershell
git init
git add .
git commit -m "Prepare Render deployment"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

注意：`.env` 已在 `.gitignore` 中，不要提交真实密钥。

## 3. Render 一键创建

1. 打开 Render Dashboard。
2. 选择 `New` -> `Blueprint`。
3. 连接上一步的 GitHub 仓库。
4. Render 会读取仓库根目录的 `render.yaml`，创建两个服务。
5. 按提示填写这些环境变量：

```text
MONGODB_URI=你的 MongoDB Atlas 连接串
DECODO_BASIC_AUTH_TOKEN=你的 Decodo token
DEEPSEEK_API_KEY=你的 DeepSeek API key
```

## 4. 验证

部署完成后先打开后端健康检查：

```text
https://你的后端域名/healthz
```

看到 `{"ok":true}` 后，再打开前端：

```text
https://你的前端域名/tracker
```

## 5. 免费版限制

Render 免费后端会在一段时间无访问后休眠，第一次打开可能较慢。这适合 MVP 和团队小范围测试；如果后续需要稳定在线，可以把后端升级到付费实例。
