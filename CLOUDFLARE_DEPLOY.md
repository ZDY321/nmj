# Cloudflare 部署说明

这个项目建议部署为 **Cloudflare Workers + Static Assets + D1**。不需要 KV。

## 1. 不要同步到 GitHub 的文件

当前 `.gitignore` 已经忽略：

- `node_modules/`
- `dist/`
- `.wrangler/`
- `.dev.vars`
- `.env`、`.env.*`、`*.local`
- 日志、coverage、TypeScript build info

需要同步的核心文件包括：`src/`、`public/`、`migrations/`、`package.json`、`package-lock.json`、`vite.config.ts`、`wrangler.toml`。

## 2. 创建 D1 数据库

在 Cloudflare Dashboard 创建 D1 数据库，名称建议：

```text
teacher_salary_tracker
```

或者用 Wrangler：

```bash
npx wrangler d1 create teacher_salary_tracker
```

创建完成后，把 Cloudflare 给你的 `database_id` 填到 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "teacher_salary_tracker"
database_id = "这里填你的 D1 database_id"
```

`binding` 必须保持为 `DB`，因为 Worker 代码里使用的是 `env.DB`。

## 3. 初始化数据库表

本地登录 Cloudflare 后执行：

```bash
npx wrangler d1 execute teacher_salary_tracker --remote --file=./migrations/0001_initial.sql
```

如果你后续把 D1 数据库改成别的名字，命令里的 `teacher_salary_tracker` 也要一起改。

## 4. 设置后台 API Secret

为了避免部署后 `/api/admin/*` 管理接口裸露，需要设置一个 Worker Secret：

```bash
npx wrangler secret put ADMIN_API_TOKEN
```

输入一串足够长的随机值，例如 32 位以上随机字符串。

如果你在 Cloudflare Dashboard 里连接 GitHub 部署，也需要在 Worker 的 **Settings -> Variables and Secrets** 中添加：

```text
ADMIN_API_TOKEN = 你的随机密钥
```

类型选择 Secret，不要选择普通明文变量。

## 5. 连接 GitHub 部署

Cloudflare 里选择 Workers，而不是 Pages。

推荐配置：

```text
Framework preset: None
Root directory: /
Build command: npm run build
Deploy command: npx wrangler deploy
```

如果你希望每次部署前自动确保数据库表存在，可以把 Deploy command 改成：

```bash
npx wrangler d1 execute teacher_salary_tracker --remote --file=./migrations/0001_initial.sql && npx wrangler deploy
```

## 6. 本地预览 Cloudflare Worker

普通 Vite 本地服务只适合看 UI：

```bash
npm run dev
```

要测试 Worker API、D1 绑定和静态资源一起运行，使用：

```bash
npm run build
npx wrangler dev
```

## 7. 当前存储状态

当前前端仍以浏览器本地加密存储为主。Worker 和 D1 表结构已经准备好，但完整的云端多用户体验还需要继续接入：

- 用户注册/登录的远程会话
- 加密文档上传和拉取
- 管理员只看账号元数据
- 用户删除申请、确认、撤销和定时清理

不要把未受保护的写入接口直接接到前端，否则虽然管理员仍看不到加密内容，但账号数据可能被恶意覆盖。
