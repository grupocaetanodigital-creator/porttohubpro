/**
 * Cloudflare Workers Entrypoint — PorttoHub Pro
 * Processa todas as rotas /api/* na borda com autenticação Bearer JWT + Upstash Redis REST
 * e entrega os assets estáticos da SPA (./dist) via binding env.ASSETS.
 */

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
  handleCacheBenchmark,
  jsonResponse
} from './server/apiHandlers';
import type { RuntimeEnv } from './server/upstashClient';

export default {
  async fetch(request: Request, env: RuntimeEnv): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/health' && method === 'GET') {
        return handleHealth(env, 'cloudflare-worker');
      }
      if (pathname === '/api/github-versao' && method === 'GET') {
        return handleGithubVersao(env);
      }
      if (pathname === '/api/ocr-etiqueta' && method === 'POST') {
        return handleOcrEtiqueta(request, env);
      }
      if (pathname === '/api/admin/operadores/provisionar' && method === 'POST') {
        return handleAdminProvisionarOperador(request, env);
      }
      if (pathname === '/api/cache/query' && method === 'POST') {
        return handleCacheQuery(request, env);
      }
      if (pathname === '/api/cache/invalidate' && method === 'POST') {
        return handleCacheInvalidate(request, env);
      }
      if (pathname === '/api/cache/stats' && method === 'GET') {
        return handleCacheStats(request, env);
      }
      if (pathname === '/api/cache/clear' && method === 'POST') {
        return handleCacheClear(request, env);
      }
      if (pathname === '/api/cache/warmup' && method === 'POST') {
        return handleCacheWarmup(request, env);
      }
      if (pathname === '/api/cache/benchmark' && method === 'GET') {
        return handleCacheBenchmark(request, env);
      }

      return jsonResponse({ erro: 'Endpoint /api não encontrado.' }, 404);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return jsonResponse({ erro: 'Binding ASSETS não configurado neste Worker.' }, 500);
  }
};
