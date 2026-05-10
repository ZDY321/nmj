# 从 Cloudflare 连接 GitHub 仓库开始部署

这份文档只写你接下来在 Cloudflare 页面里应该怎么点、怎么填。

当前项目部署方式：

```text
Cloudflare Workers + Static Assets + D1
```

不要创建 KV。这个项目现在不需要 KV。

## 重要说明

当前代码已经可以部署上线看页面，但“云端多用户完整体验”还没做完。

现在部署后可以体验：

- 网站页面
- 本地注册/登录
- 本地浏览器加密保存
- 日历、课时、工资统计等前端功能

现在部署后还不能完整体验：

- 换设备自动同步数据
- 多用户云端账号系统
- 管理员真实用户列表
- 用户删除申请和 10 天自动删除
- 云端统一系统公告

这些属于下一步开发内容。

## 第 1 步：先把代码推到 GitHub

把当前项目同步到 GitHub。

不要上传这些文件和目录：

```text
node_modules/
dist/
.wrangler/
.dev.vars
.env
.env.*
*.local
.claude/
ui-preview/
v2_mozv.jpg
12654.jpg
dev-server.log
dev-server.err
tsconfig.tsbuildinfo
```

这些已经写进 `.gitignore`。

## 第 2 步：在 Cloudflare 创建 Worker 项目

进入 Cloudflare Dashboard。

左侧进入：

```text
Workers & Pages
```

点击：

```text
Create
```

选择：

```text
Import a repository
```

如果页面让你选择类型，选择：

```text
Workers
```

不要选择 Pages。

## 第 3 步：连接 GitHub

点击 GitHub 授权。

选择你的仓库。

如果 Cloudflare 问你允许访问哪些仓库，选择这个项目所在仓库即可。

## 第 4 步：填写项目基础信息

项目名称可以填：

```text
teacher-salary-tracker
```

生产分支选择：

```text
main
```

如果你的 GitHub 默认分支叫 `master`，就选 `master`。

Root directory 填：

```text
/
```

## 第 5 步：填写构建和部署命令

如果 Cloudflare 页面有分开的输入框，按下面填写。

Install command：

```bash
npm ci
```

Build command：

```bash
npm run build
```

Deploy command：

```bash
npx wrangler deploy
```

如果 Cloudflare 页面只有一个命令输入框，填写：

```bash
npm ci && npm run build && npx wrangler deploy
```

如果 Cloudflare 自动帮你安装依赖，那么命令可以写：

```bash
npm run build && npx wrangler deploy
```

## 第 6 步：先不要急着 Deploy

在真正部署前，需要先创建 D1 数据库，并把 ID 填进 `wrangler.toml`。

否则 Worker 运行时找不到数据库。

## 第 7 步：创建 D1 数据库

Cloudflare Dashboard 左侧进入：

```text
Storage & Databases
```

进入：

```text
D1 SQL Database
```

点击：

```text
Create database
```

数据库名称填写：

```text
teacher_salary_tracker
```

创建完成后，进入这个 D1 数据库详情页。

找到：

```text
Database ID
```

复制这个 ID。

## 第 8 步：把 D1 Database ID 填到代码里

打开项目里的：

```text
wrangler.toml
```

找到：

```toml
database_id = "replace-with-cloudflare-d1-database-id"
```

替换成你刚刚复制的 Database ID。

最终应该类似：

```toml
[[d1_databases]]
binding = "DB"
database_name = "teacher_salary_tracker"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

注意：

- `binding = "DB"` 不要改。
- `database_name = "teacher_salary_tracker"` 要和 Cloudflare 里数据库名称一致。
- `database_id` 必须是 Cloudflare 给你的真实 ID。

改完以后，把这个修改提交并推送到 GitHub。

## 第 9 步：确认 Static Assets 配置

`wrangler.toml` 里应该已经有：

```toml
[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
```

这个不用改。

它的意思是：

- `npm run build` 生成 `dist/`
- Worker 从 `dist/` 里提供前端页面
- 刷新前端路由时不会 404

## 第 10 步：添加 D1 Binding

如果 Cloudflare 自动读取 `wrangler.toml`，通常会自动绑定。

如果页面让你手动添加 Binding，按下面填：

```text
Variable name / Binding name: DB
Type: D1 database
Database: teacher_salary_tracker
```

不要填 KV。

不要把 D1 binding 改成别的名字。

代码里用的是：

```ts
env.DB
```

所以必须叫 `DB`。

## 第 11 步：添加后台 Secret

进入你刚创建的 Worker 项目。

进入：

```text
Settings
```

找到：

```text
Variables and Secrets
```

点击：

```text
Add
```

填写：

```text
Name: ADMIN_API_TOKEN
Type: Secret
Value: 自己生成一串很长的随机字符串
```

例如：

```text
R1dTg9qH4YpX2mL8sA6vN3cZ7uP0bK5w
```

这个值不要提交到 GitHub。

这个 Secret 用来保护：

```text
/api/admin/*
```

如果不设置，管理接口会返回 401。

## 第 12 步：初始化 D1 数据表

这一步 Cloudflare 页面里不一定好操作，建议用本地命令执行一次。

在项目根目录执行：

```bash
npx wrangler login
```

登录 Cloudflare。

然后执行：

```bash
npx wrangler d1 execute teacher_salary_tracker --remote --file=./migrations/0001_initial.sql
```

执行成功后，D1 里会创建这些表：

```text
users
encrypted_documents
app_settings
```

如果你的数据库名称不是 `teacher_salary_tracker`，把命令里的名字改成你的数据库名。

## 第 13 步：开始第一次部署

回到 Cloudflare 的 Worker 项目页面。

点击部署。

如果你已经连接 GitHub，之后每次推送到 `main` 分支，Cloudflare 会自动部署。

部署成功后，你会得到一个地址，类似：

```text
https://teacher-salary-tracker.你的账号.workers.dev
```

## 第 14 步：检查网站是否部署成功

打开 Worker 地址。

如果页面能显示，说明静态资源部署成功。

再打开：

```text
https://你的地址/api/health
```

应该看到：

```json
{"ok":true,"service":"teacher-salary-tracker"}
```

如果看到这个，说明 Worker API 正常。

## 第 15 步：检查 D1 是否能访问

当前前端还没有完整接入云端 D1，所以你暂时不会在页面里明显看到 D1 数据变化。

但 Worker 代码已经有 D1 API 骨架。

例如：

```text
/api/public/login-notice
```

可以从 D1 的 `app_settings` 里读取公告。

如果 D1 没初始化，这类接口可能会报错。

## 第 16 步：常见错误

### 1. 部署时报 database_id 错误

检查 `wrangler.toml`：

```toml
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

不能还是：

```toml
database_id = "replace-with-cloudflare-d1-database-id"
```

### 2. Worker 找不到 DB

检查 D1 Binding 名称必须是：

```text
DB
```

不能写成：

```text
D1
DATABASE
teacher_salary_tracker
```

### 3. 页面刷新后 404

检查 `wrangler.toml` 是否有：

```toml
not_found_handling = "single-page-application"
```

### 4. `/api/admin/users` 返回 401

这是正常的。

管理接口需要 `ADMIN_API_TOKEN`。

浏览器直接访问会返回 401。

### 5. 部署后换电脑数据没了

这也是当前阶段正常的。

因为云端多用户同步还没做完。现在数据仍主要存储在当前浏览器本地。

## 第 17 步：下一步需要继续开发什么

如果你希望部署后真的多人使用，需要继续做：

1. 云端注册。
2. 云端登录。
3. 登录后从 D1 拉取用户密文。
4. 用户修改数据后，把加密后的密文保存到 D1。
5. 管理员后台读取用户元数据列表。
6. 管理员只看账号状态，不看用户内容。
7. 删除用户申请流程。
8. 3 天提醒 + 7 天倒计时 + 10 天自动删除。
9. 系统公告从 D1 统一读取。

这部分目前还没有完整做完。

## 最终你要填的东西汇总

Cloudflare 连接 GitHub 时：

```text
Root directory: /
Install command: npm ci
Build command: npm run build
Deploy command: npx wrangler deploy
```

D1：

```text
Database name: teacher_salary_tracker
Binding name: DB
```

`wrangler.toml`：

```toml
database_id = "你的 D1 Database ID"
```

Secret：

```text
Name: ADMIN_API_TOKEN
Type: Secret
Value: 你的随机长密钥
```

不需要：

```text
KV
R2
Queues
Durable Objects
```

## 官方文档

- Workers Builds / Git 集成：https://developers.cloudflare.com/workers/ci-cd/builds/
- Workers Static Assets：https://developers.cloudflare.com/workers/static-assets/binding/
- D1 Wrangler 命令：https://developers.cloudflare.com/d1/wrangler-commands/
- Workers Secrets：https://developers.cloudflare.com/workers/configuration/secrets/
