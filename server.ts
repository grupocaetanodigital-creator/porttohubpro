delete (globalThis as any).__dirname;
delete (globalThis as any).__filename;
process.env.DISABLE_HMR = 'true';

import express from 'express';
import http from 'http';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import {
  handleHealth,
  handleGithubVersao,
  handleOcrEtiqueta,
  handleAdminProvisionarOperador,
  handleCacheQuery,
  handleCacheInvalidate,
  handleCacheStats,
  handleCacheClear,
  handleCacheWarmup,
  handleCacheBenchmark
} from './src/server/apiHandlers.ts';

dotenv.config();

const app = express();
const port = 3000;

app.use(compression({
  threshold: 1024,
  level: 6
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

function toWebRequest(req: express.Request): Request {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  const url = `${protocol}://${host}${req.originalUrl}`;
  const headers = new Headers();

  for (const [key, val] of Object.entries(req.headers)) {
    if (Array.isArray(val)) {
      val.forEach(v => headers.append(key, v));
    } else if (typeof val === 'string') {
      headers.set(key, val);
    }
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const bodyStr = hasBody && req.body !== undefined ? JSON.stringify(req.body) : undefined;

  return new Request(url, {
    method,
    headers,
    body: bodyStr
  });
}

async function sendWebResponse(res: express.Response, webRes: Response): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const text = await webRes.text();
  res.send(text);
}

app.get('/api/health', async (_req, res) => {
  const webRes = await handleHealth(process.env as any, 'node');
  await sendWebResponse(res, webRes);
});

app.get('/api/github-versao', async (_req, res) => {
  let localGitInfo: { sha?: string; mensagem?: string; autor?: string; dataIso?: string } = {};
  try {
    const { execSync } = await import('child_process');
    localGitInfo = {
      sha: execSync('git rev-parse --short HEAD', { timeout: 1200 }).toString().trim(),
      mensagem: execSync('git log -1 --pretty=%s', { timeout: 1200 }).toString().trim(),
      dataIso: execSync('git log -1 --format=%cd --date=iso-strict', { timeout: 1200 }).toString().trim(),
      autor: execSync('git log -1 --format=%an', { timeout: 1200 }).toString().trim()
    };
  } catch {}
  const webRes = await handleGithubVersao(process.env as any, localGitInfo);
  await sendWebResponse(res, webRes);
});

app.post('/api/ocr-etiqueta', async (req, res) => {
  const webRes = await handleOcrEtiqueta(toWebRequest(req), process.env as any);
  await sendWebResponse(res, webRes);
});

app.post('/api/admin/operadores/provisionar', async (req, res) => {
  const webRes = await handleAdminProvisionarOperador(toWebRequest(req), process.env as any);
  await sendWebResponse(res, webRes);
});

app.post('/api/cache/query', async (req, res) => {
  const webRes = await handleCacheQuery(toWebRequest(req), process.env as any);
  await sendWebResponse(res, webRes);
});

app.post('/api/cache/invalidate', async (req, res) => {
  const webRes = await handleCacheInvalidate(toWebRequest(req), process.env as any);
  await sendWebResponse(res, webRes);
});

app.get('/api/cache/stats', async (req, res) => {
  const webRes = await handleCacheStats(toWebRequest(req), process.env as any);
  await sendWebResponse(res, webRes);
});

app.post('/api/cache/clear', async (req, res) => {
  const webRes = await handleCacheClear(toWebRequest(req), process.env as any);
  await sendWebResponse(res, webRes);
});

app.post('/api/cache/warmup', async (req, res) => {
  const webRes = await handleCacheWarmup(toWebRequest(req), process.env as any);
  await sendWebResponse(res, webRes);
});

app.get('/api/cache/benchmark', async (req, res) => {
  const webRes = await handleCacheBenchmark(toWebRequest(req), process.env as any);
  await sendWebResponse(res, webRes);
});

async function start() {
  const server = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa'
    });
    app.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      next();
    });
    app.use(vite.middlewares);
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`[PorttoHub] Servidor rodando em http://localhost:${port}`);
  });
}

start();
