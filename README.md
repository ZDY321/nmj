# 课薪记录

面向老师的轻量教务和工资统计应用。项目目标是部署在 Cloudflare 上，通过 GitHub 同步代码，使用 D1 保存账户和加密文档。

## 当前进度

- React + TypeScript 前端骨架
- Cloudflare Workers 静态资源和云端 API
- D1 migrations
- 云端注册、登录和会话
- 浏览器端加密数据模型
- D1 密文同步和换设备拉取
- 管理员真实用户列表、注册开关、系统公告、用户反馈处理
- 删除用户申请、二次确认、撤销、10 天自动删除流程
- 老师端工作台、今日提醒、排课、学生/校区、工资概览、管理后台 UI

## 本地运行

```bash
npm install
npm run dev
```

然后打开 Vite 输出的本地地址。

## 构建

```bash
npm run build
```

## Cloudflare 部署

1. 在 Cloudflare 创建 D1 数据库。
2. 把 `wrangler.toml` 里的 `database_id` 替换成真实 ID。
3. 按顺序执行 `migrations/` 目录下的 SQL 迁移文件。
4. 通过 GitHub 连接 Cloudflare，或本地使用：

```bash
npm run deploy
```

## 隐私原则

课程、学生、校区、排课、费用规则、上课内容和作业等敏感信息必须先在浏览器加密，再进入数据库。管理员后台不提供查看老师明细的入口。

## 管理员账户

第一位云端注册用户会成为管理员。

正式部署时不要允许普通用户自己选择管理员身份。第一个管理员登录后应在管理后台关闭注册，需要给新用户开户时再临时开启。
