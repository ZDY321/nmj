# Cloudflare 部署教程

本文档记录本项目部署到 Cloudflare 的完整步骤。

当前项目适合部署为：

```text
Cloudflare Workers + Static Assets + D1
```

暂时不需要：

```text
KV
R2
Queues
Durable Objects
Vectorize
```

## 0. 当前功能状态

现在已经完成：

- 前端 UI
- 浏览器端加密、D1 只保存密文
- 云端注册和登录
- 换设备后从 D1 拉取加密数据并在浏览器解密
- 用户数据自动同步到 D1
- Worker 静态资源部署配置
- D1 数据库表结构和升级迁移
- 登录会话 API
- 管理员真实用户列表
- 注册开关 API 和后台按钮
- 系统公告从 D1 统一读取和更新
- 删除用户申请、二次确认、撤销、10 天到期自动删除流程
- 正式版第一位注册用户自动成为管理员

还没有完成：

- 密码找回和恢复码 UI
- 邮件邀请、邮箱验证或短信验证
- 更细的审计日志查看界面
- 多管理员权限分级

也就是说：**当前版本已经接入完整云端多用户主流程，可以按 Cloudflare Workers + D1 形态上线测试。**

## 1. 提交到 GitHub 前检查

需要提交：

```text
src/
public/
migrations/
index.html
package.json
package-lock.json
tsconfig.json
vite.config.ts
wrangler.toml
CLOUDFLARE_DEPLOY.md
README.md
```

不要提交：

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

## 2. 安装依赖并本地构建

在项目根目录执行：

```bash
npm ci
npm run build
```

构建通过后会生成：

```text
dist/
```

`dist/` 不需要提交到 GitHub。

## 3. 登录 Cloudflare

如果你准备用命令行操作，先执行：

```bash
npx wrangler login
```

浏览器会打开 Cloudflare 授权页面，登录并授权即可。

如果你只用 Cloudflare Dashboard 图形界面，也可以先跳过这一步。



## 4. 创建 D1 数据库

### 方式 A：Dashboard 创建

进入 Cloudflare Dashboard：

```text
Storage & Databases -> D1 SQL Database -> Create
```

数据库名称建议填写：

```text
teacher_salary_tracker
```

创建完成后，找到数据库的 `database_id`。

### 方式 B：命令行创建

在项目根目录执行：

```bash
npx wrangler d1 create teacher_salary_tracker
```

命令执行成功后会输出类似：

```toml
[[d1_databases]]
binding = "DB"
database_name = "teacher_salary_tracker"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

复制里面的 `database_id`。

## 5. 填写 wrangler.toml

打开项目根目录的 `wrangler.toml`。

把：

```toml
database_id = "replace-with-cloudflare-d1-database-id"
```

替换为你自己的 D1 数据库 ID。

最终应该类似：

```toml
name = "teacher-salary-tracker"
main = "src/worker/index.ts"
compatibility_date = "2026-05-10"

[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"

[[d1_databases]]
binding = "DB"
database_name = "teacher_salary_tracker"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

注意：

- `binding = "DB"` 不要改。
- `[assets].binding = "ASSETS"` 不要改。
- `database_name` 要和你创建的 D1 数据库名称一致。
- `database_id` 必须填 Cloudflare 给你的真实 ID。

## 6. 初始化 D1 数据表

项目已经有迁移文件：

```text
migrations/0001_initial.sql
migrations/0002_cloud_multi_user.sql
```

新数据库按顺序执行：

```bash
npx wrangler d1 execute teacher_salary_tracker --remote --file=./migrations/0001_initial.sql
npx wrangler d1 execute teacher_salary_tracker --remote --file=./migrations/0002_cloud_multi_user.sql
```

这会创建：

```text
users
encrypted_documents
app_settings
user_sessions
user_deletion_events
```

同时会写入默认设置：

```text
login_notice
registration_enabled = true
```

`registration_enabled = true` 表示首次部署后允许注册。你注册完第一个管理员账号后，建议马上关闭注册。

如果执行成功，D1 里会有这些表。

如果你把数据库名称改成了别的，命令里的 `teacher_salary_tracker` 也要改成你的数据库名。

如果线上库已经执行过 `0001_initial.sql`，只需要补执行：

```bash
npx wrangler d1 execute teacher_salary_tracker --remote --file=./migrations/0002_cloud_multi_user.sql
```

## 7. 设置后台 API Secret

管理员后台现在使用登录后的管理员会话，不需要把 `ADMIN_API_TOKEN` 放进浏览器。

`ADMIN_API_TOKEN` 仍可作为命令行维护入口，用于公告、注册开关和到期删除补跑。建议生产环境继续设置。

必须设置 Worker Secret：

```bash
npx wrangler secret put ADMIN_API_TOKEN
```

然后输入一串长随机值，例如：

```text
R1dTg9qH4YpX2mL8sA6vN3cZ7uP0bK5w
```

不要把这个值提交到 GitHub。

### 如果你用 Dashboard 设置：

进入：

```text
Workers & Pages -> 你的 Worker -> Settings -> Variables and Secrets -> Add
```

填写：

```text
Name: ADMIN_API_TOKEN
Type: Secret
Value: 你的长随机密钥
```

## 8. 本地测试 Worker 部署形态

普通看 UI：

```bash
npm run dev
```

测试 Worker + 静态资源 + D1 绑定：

```bash
npm run build
npx wrangler dev
```

打开 Wrangler 给出的本地地址。

测试健康接口：

```bash
curl http://127.0.0.1:8787/api/health
```

应该返回：

```json
{"ok":true,"service":"teacher-salary-tracker"}
```

## 9. 命令行部署

如果你不使用 GitHub 自动部署，可以直接在本地执行：

```bash
npm run build
npx wrangler deploy
```

部署完成后，Cloudflare 会输出一个线上地址，例如：

```text
https://teacher-salary-tracker.<你的账号>.workers.dev
```

访问：

```text
https://你的地址/api/health
```

如果返回 `ok: true`，说明 Worker 正常。

# 10. 通过 GitHub 自动部署

你说你会把代码同步到 GitHub，然后在 Cloudflare 上连接 GitHub 项目。

推荐使用 **Workers**，不要用 Pages。

Cloudflare Dashboard 大致路径：

```text
Workers & Pages -> Create -> Workers -> Import a repository
```

选择你的 GitHub 仓库。

常见配置如下：

```text
Project name: teacher-salary-tracker
Production branch: main
Root directory: /
Install command: npm ci
Build command: npm run build
Deploy command: npx wrangler deploy
```

如果 Cloudflare 界面只有一个命令框，可以填写：

```bash
npm ci && npm run build && npx wrangler deploy
```

如果它会自动执行 install，则：

```bash
npm run build && npx wrangler deploy
```

## 11. GitHub 自动部署时的 D1 绑定

如果 Cloudflare 自动读取 `wrangler.toml`，通常会自动绑定 D1。

如果 Dashboard 要你手动填：

```text
Binding name: DB
Resource type: D1 database
Database: teacher_salary_tracker
```

静态资源不需要手动填，`wrangler.toml` 里已有：

```toml
[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
```

## 12. GitHub 自动部署时的 Secret

自动部署环境也需要 Secret。

进入 Worker 项目：

```text
Settings -> Variables and Secrets
```

添加：

```text
Name: ADMIN_API_TOKEN
Type: Secret
Value: 你的长随机密钥
```

## 13. 是否需要 KV

当前不需要 KV。

原因：

- 用户账号元数据适合放 D1。
- 加密后的用户文档适合放 D1。
- 系统公告适合放 D1 的 `app_settings`。
- 删除申请、删除状态、审计记录也适合放 D1。

后续如果要做高频短期缓存，再考虑 KV。

## 14. 部署后能体验什么

现在部署后可以体验：

- 页面 UI
- 云端注册/登录
- 浏览器端加密、D1 密文保存
- 换设备登录后拉取云端密文并解密
- 用户数据变更后自动同步到 D1
- 管理员后台真实用户列表
- 注册开关
- 系统公告统一读取和更新
- 删除申请、二次确认、撤销、10 天自动删除
- 日历、课时、工资等前端功能

浏览器仍会保留一份本地加密缓存。缓存只作为网络失败时的兜底，不再是主存储。

## 15. 云端多用户机制

当前实现：

1. 登录前先通过 `/api/auth/lookup` 获取账号登录盐。
2. 浏览器用密码派生登录校验值，服务端不接收明文密码。
3. 登录成功后返回会话 token。
4. 课程、学生、工资、排课等业务数据先在浏览器加密。
5. D1 的 `encrypted_documents` 只保存密文。
6. 换设备登录后，浏览器从 `/api/me/vault` 拉取密文并用密码解密。
7. 管理员后台只显示账号元数据和删除状态。
8. 系统公告从 D1 的 `app_settings` 统一读取。
9. 到期删除由 Worker cron 每天 03:00 UTC 自动补跑，也可以在后台手动执行。

## 15.1 正式版第一位用户是不是管理员

是。

正式版逻辑是：

```text
D1 users 表没有任何用户时，第一个注册用户自动成为 admin。
D1 users 表已有用户时，后续注册用户默认为 teacher。
```

建议部署后的操作顺序：

1. 先让你自己注册第一个账号。
2. 这个账号会成为管理员。
3. 立刻关闭注册。
4. 需要给朋友开户时，临时开启注册。
5. 朋友注册完成后，再关闭注册。

## 15.2 如何开启或关闭注册

管理员登录后可以在“管理后台”里直接开启或关闭注册。

命令行也可以用 `ADMIN_API_TOKEN` 操作。

关闭注册：

```bash
curl -X PUT "https://你的-worker地址/api/admin/registration" \
  -H "Authorization: Bearer 你的 ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"enabled\":false}"
```

开启注册：

```bash
curl -X PUT "https://你的-worker地址/api/admin/registration" \
  -H "Authorization: Bearer 你的 ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"enabled\":true}"
```

查看当前注册状态：

```text
https://你的-worker地址/api/public/settings
```

返回：

```json
{"registrationEnabled":true}
```

如果是 `false`，登录页会隐藏注册入口，并显示“当前暂未开放注册”。

## 16. 管理员删除用户建议流程

当前 `0002_cloud_multi_user.sql` 已增加这些字段：

```text
delete_requested_at
delete_requested_by
delete_notice_count
delete_second_confirmed_at
delete_scheduled_at
delete_cancelled_at
delete_reason
```

推荐流程：

1. 管理员发起删除。
2. 用户状态变为 `delete_requested`。
3. 用户下次登录必须看到删除提醒。
4. 管理员可二次确认，将状态变为 `delete_scheduled`。
5. 10 天内管理员或用户本人都可以撤销。
6. 到期后 Worker cron 自动删除密文、会话和可登录账号信息。
7. 管理员只能看到账号状态，不能查看课程、学生、工资等明文内容。

这样能兼顾：

- 用户误注册清理
- 长期不用账号清理
- 用户隐私
- 管理员无法越权查看内容
- 删除过程可审计

## 17. 常见问题

### 要不要改 Worker 名称？

可以改。

在 `wrangler.toml` 里：

```toml
name = "teacher-salary-tracker"
```

这个会影响 Worker 项目名和默认 workers.dev 地址。

### D1 binding 可以叫别的吗？

不建议。

当前 Worker 代码使用：

```ts
env.DB
```

所以 binding 必须叫 `DB`。

### ASSETS binding 可以叫别的吗？

不建议。

当前 Worker 代码使用：

```ts
env.ASSETS.fetch(request)
```

所以 binding 必须叫 `ASSETS`。

### 部署后 `/api/admin/users` 返回 401 正常吗？

正常。

浏览器后台会在管理员登录后自动带上会话 token。你直接打开 API 地址没有登录会话，所以会返回 401。

请求头格式是：

```text
Authorization: Bearer 登录后返回的 session token
```

### ADMIN_API_TOKEN 还能做什么？

它现在只作为命令行维护入口保留，适合用来关闭注册、更新公告或手动执行到期删除。

管理员日常操作建议直接使用前端管理后台。

## 18. 官方文档

- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/binding/
- D1 Wrangler commands: https://developers.cloudflare.com/d1/wrangler-commands/
- Workers Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
