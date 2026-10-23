/* Lingua — minimal service worker.
 *
 * App-shell cache only. The gateway calls (OCR / translate) are never cached
 * or intercepted — every call hits the network so the key in localStorage
 * stays usable and any model change on the gateway is picked up immediately.
 */
const CACHE = 'lingua-cache-v1';

const PRECACHE = [
  './',
  './index.html',
  './web.html',
  './mobile.html',
  './manifest.webmanifest',
  './assets/lingua.css',
  './assets/lingua-core.js',
  './assets/lingua-web.js',
  './assets/lingua-mobile.js',
  './assets/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function isHtmlRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept cross-origin calls (OCR / translate gateways).
  if (url.origin !== self.location.origin) return;

  if (isHtmlRequest(request)) {
    // Network-first for navigations / HTML.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for same-origin static assets.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});
