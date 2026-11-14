/**
 * PorttoHub / INFPORT 1.0 - Service Worker Oficial PWA
 * OTIMIZAÇÃO DE ASSETS, ZERO-LATENCY E RESILIÊNCIA OFFLINE
 * 
 * ESTRATÉGIAS DE CACHE APLICADAS:
 * 1. Stale-While-Revalidate: Para Scripts JS, CSS, Fontes e Imagens.
 *    -> Entrega imediata em 0ms a partir do cache local, revalidando silenciosamente em segundo plano.
 * 2. Network-First com Fallback: Apenas para checagem de versão (/version.json) e rotas críticas de autenticação.
 * 3. Cache Storage Segregado: Permite purga seletiva de versões antigas sem perder cache de fotos.
 */

const CACHE_APP_SHELL = 'porttohub-shell-v6';
const CACHE_ESTATICOS_ASSETS = 'porttohub-assets-v6';

const ASSETS_ESSENCIAIS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_APP_SHELL).then((cache) => {
      return cache.addAll(ASSETS_ESSENCIAIS).catch((err) => {
        console.warn('[SW] Aviso no precache inicial:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_APP_SHELL && key !== CACHE_ESTATICOS_ASSETS) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Nunca intercepta/cacheia Auth, API, Supabase REST/Storage, URLs assinadas ou módulos Vite dev
  if (
    url.protocol === 'ws:' ||
    url.protocol === 'wss:' ||
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.includes('/storage/v1/') ||
    url.searchParams.has('token') ||
    /\.(tsx?|jsx|mjs)$/i.test(url.pathname)
  ) {
    return;
  }

  // Checagem de versão: sempre network-first sem persistir respostas privadas
  if (url.pathname === '/version.json' || url.searchParams.has('ts')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Scripts JS, CSS, fontes e imagens estáticas públicas do próprio domínio (não Storage privado)
  const ehAssetEstaticoPublico =
    url.origin === self.location.origin &&
    (/\.(js|css|woff2?|ttf|eot|png|jpe?g|webp|svg|ico)$/i.test(url.pathname) ||
      url.pathname.startsWith('/assets/'));

  if (ehAssetEstaticoPublico) {
    event.respondWith(
      caches.open(CACHE_ESTATICOS_ASSETS).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => null);

          return cachedResponse || fetchPromise.then((res) => res || cachedResponse);
        });
      })
    );
    return;
  }

  // Navegação SPA (index.html Shell): Network-first com fallback para App Shell
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
            const copia = networkResponse.clone();
            caches.open(CACHE_APP_SHELL).then((c) => c.put('/', copia));
          }
          return networkResponse;
        })
        .catch(() => caches.match('/') || caches.match('/index.html'))
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
