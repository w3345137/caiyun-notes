/**
 * 彩云笔记 Service Worker
 * 缓存策略：
 * - HTML: Network First（保证拿到最新版本，离线时用缓存）
 * - JS/CSS/字体: Stale While Revalidate（先用缓存，后台更新）
 * - 图片: Cache First（长期缓存）
 * - API 请求: 不缓存（走 Realtime 同步）
 */

const CACHE_NAME = 'caiyun-notes-v2';

// 不缓存的路径模式
const NO_CACHE_PATTERNS = [
  /\/functions\/v1\//,  // Edge Functions API
  /supabase\.co/,       // Supabase API
  /realtime/,           // Realtime WebSocket
  /auth/,               // Auth API
];

self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] 清理旧缓存:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 跳过非 GET 请求
  if (event.request.method !== 'GET') return;

  // 跳过 API 请求
  if (NO_CACHE_PATTERNS.some(p => p.test(event.request.url))) return;

  // 跳过 chrome-extension 等非 http 请求
  if (!event.request.url.startsWith('http')) return;

  // HTML 页面 — Network First
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // JS/CSS/字体 — Stale While Revalidate
  if (url.pathname.match(/\.(js|css|woff2?|ttf|eot)(\?.*)?$/)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 图片 — Cache First
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)(\?.*)?$/)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});
