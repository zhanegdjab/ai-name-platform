// 本地预览服务器：模拟 vercel dev 的 api 路由行为，不需要登录 Vercel 就能测试
// 启动：npm run dev  然后打开 http://localhost:3000
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

const { default: nameHandler } = await import('./api/name.js');
const { default: historyHandler } = await import('./api/history.js');

function withHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  withHelpers(res);

  try {
    if (url.pathname === '/api/name') {
      if (req.method === 'POST') {
        const raw = await readBody(req);
        try {
          req.body = raw ? JSON.parse(raw) : {};
        } catch (_) {
          req.body = {};
        }
      }
      await nameHandler(req, res);
      return;
    }

    if (url.pathname === '/api/history') {
      await historyHandler(req, res);
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
      return;
    }

    res.status(404).json({ error: 'Not Found' });
  } catch (err) {
    console.error('[dev-server]', err);
    if (!res.writableEnded) res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`本地预览已启动：http://localhost:${PORT}`);
});
