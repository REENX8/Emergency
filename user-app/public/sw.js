/**
 * Service Worker — EVAC user-app offline support
 *
 * Strategy:
 *   - App shell (HTML/JS/CSS) → Cache-first (stale-while-revalidate)
 *   - Floor plan images       → Cache-first (long-lived)
 *   - API calls (/api/*)      → Network-first with offline fallback JSON
 *   - WebSocket (/ws)         → Never intercept
 */

const CACHE_NAME   = 'evac-v1';
const OFFLINE_JSON = JSON.stringify({ offline: true, error: 'No network connection' });

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/design-tokens.css',
];

// ---------------------------------------------------------------------------
// Install — precache app shell
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate — clean up old caches
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept WebSocket upgrades or non-GET requests to API
  if (request.headers.get('upgrade') === 'websocket') return;

  if (url.pathname.startsWith('/api/')) {
    // Network-first for API: fresh data, fallback to cache, then offline JSON
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return resp;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(OFFLINE_JSON, {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        })
    );
    return;
  }

  if (url.pathname.startsWith('/uploads/')) {
    // Cache-first for floor plan images (rarely change)
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return resp;
        });
      })
    );
    return;
  }

  // Default: stale-while-revalidate for app shell
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return resp;
      });
      return cached || networkFetch;
    })
  );
});
