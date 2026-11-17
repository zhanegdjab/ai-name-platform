# AI 起名平台

流式输出 · 多模型切换（豆包 / DeepSeek / 通义千问 / Kimi）· Supabase 历史记录

## 目录结构

```
api/name.js        起名接口：SSE 流式转发 + 写库
api/history.js     历史记录接口
index.html         前端页面
dev-server.js      本地预览服务器（替代 vercel dev，无需登录）
sql/schema.sql     Supabase 建表语句与 RLS 策略
```

## 本地跑起来

1. 复制 `.env.example` 为 `.env`，填入密钥
2. `npm install`
3. `npm run dev`，浏览器打开 http://localhost:3000

## 部署到 Vercel

1. 在 Supabase 的 SQL Editor 里执行 `sql/schema.sql`
2. 推送到 GitHub（`.env` 已被 `.gitignore` 排除，不会上传）
3. Vercel 导入仓库，在 Settings → Environment Variables 里填入 `.env` 中的所有变量
4. 部署，拿到公网地址

## 环境变量

| 变量名 | 说明 | 是否必需 |
| --- | --- | --- |
| SUPABASE_URL | Supabase 项目地址 | 必需 |
| SUPABASE_ANON_KEY | Supabase 匿名 / publishable key | 必需 |
| DOUBAO_API_KEY | 火山方舟密钥 | 用豆包时必需 |
| DOUBAO_MODEL | 火山方舟接入点 ID 或模型名 | 用豆包时必需 |
| DEEPSEEK_API_KEY | DeepSeek 密钥 | 可选 |
| QWEN_API_KEY | 通义千问 DashScope 密钥 | 可选 |
| KIMI_API_KEY | Kimi 密钥 | 可选 |

## 安全

所有密钥只放环境变量，代码里不出现明文密钥；`.env` 不进 Git。
