# 课薪记录

面向老师的轻量教务和工资统计应用。项目目标是部署在 Cloudflare 上，通过 GitHub 同步代码，使用 D1 保存账户和加密文档。

## 当前进度

- React + TypeScript 前端骨架
- Cloudflare Workers 静态资源和 API 骨架
- D1 migration
- 本地浏览器加密数据模型
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
3. 执行 D1 migration。
4. 通过 GitHub 连接 Cloudflare，或本地使用：

```bash
npm run deploy
```

## 隐私原则

课程、学生、校区、排课、费用规则、上课内容和作业等敏感信息必须先在浏览器加密，再进入数据库。管理员后台不提供查看老师明细的入口。

## 管理员账户

本地演示版为了方便测试，第一位注册用户会成为管理员。

正式部署时不要允许普通用户自己选择管理员身份。管理员应通过 D1 数据库里的 `users.role = 'admin'` 字段，或后续提供的初始化脚本/受保护后台命令来设置。
