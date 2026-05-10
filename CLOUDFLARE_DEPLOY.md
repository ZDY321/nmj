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
- 本地浏览器加密存储
- Worker 静态资源部署配置
- D1 数据库表结构
- 基础 API 骨架
- 管理 API 的 `ADMIN_API_TOKEN` 保护
- 注册开关 API
- 正式版第一位注册用户自动成为管理员

还没有完成：

- 云端登录完整接入
- 换设备后从云端拉取加密数据
- 用户数据自动同步到 D1
- 管理员真实用户列表
- 删除用户申请、确认、撤销、10 天自动删除流程
- 系统公告从云端 D1 统一读取和更新
- 管理员后台里的注册开关按钮

也就是说：**现在可以上线页面，但完整云端多用户体验还需要下一步继续开发。**

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
```

执行：

```bash
npx wrangler d1 execute teacher_salary_tracker --remote --file=./migrations/0001_initial.sql
```

这一步会创建：

```text
users
encrypted_documents
app_settings
```

同时会写入默认设置：

```text
login_notice
registration_enabled = true
```

`registration_enabled = true` 表示首次部署后允许注册。你注册完第一个管理员账号后，建议马上关闭注册。

如果执行成功，D1 里会有这些表。

如果你把数据库名称改成了别的，命令里的 `teacher_salary_tracker` 也要改成你的数据库名。

## 7. 设置后台 API Secret

项目里 `/api/admin/*` 已经要求 Bearer Token。

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
- 本地注册/登录
- 本地加密保存
- 日历、课时、工资等前端功能

但目前这些数据仍主要存在当前浏览器里。

换设备、换浏览器、清空浏览器数据后，当前本地数据不会自动回来。

## 15. 下一步要做的云端多用户功能

下一步建议开发：

```text
云端账号 + 端到端加密文档同步 + 管理员账号管理
```

具体包括：

1. 登录时从 D1 校验账号。
2. 用户的课程、学生、工资、排课等数据在浏览器加密。
3. 只把密文保存到 D1 的 `encrypted_documents` 表。
4. 用户换设备登录后，拉取密文，在浏览器里用密码解密。
5. 管理员后台只显示账号元数据。
6. 管理员不能查看用户明文内容。
7. 管理员后台增加注册开关按钮。
8. 系统公告从 D1 的 `app_settings` 读取。
9. 用户删除申请流程写入 D1。

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

当前前端后台还没有注册开关按钮，但 Worker API 已经支持。

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

推荐字段可以后续加到 `users` 表：

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
4. 用户确认后立即删除账号和密文。
5. 如果 3 天内用户无回应，管理员可以二次确认。
6. 二次确认后进入 7 天倒计时。
7. 合计 10 天无回应，系统自动删除账号和密文。
8. 10 天内用户登录可以撤销删除。
9. 管理员只能看到账号状态，不能查看课程、学生、工资等明文内容。

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

管理 API 需要请求头：

```text
Authorization: Bearer 你的 ADMIN_API_TOKEN
```

浏览器直接打开会返回 401。

### 部署后数据为什么没有跨设备？

因为云端同步还没接完。

现在仍主要是本地浏览器加密存储。下一步需要把前端存储层接到 Worker/D1。

## 18. 官方文档

- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/binding/
- D1 Wrangler commands: https://developers.cloudflare.com/d1/wrangler-commands/
- Workers Secrets: https://developers.cloudflare.com/workers/configuration/secrets/

