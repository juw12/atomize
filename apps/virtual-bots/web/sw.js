// Virtual Bots - service worker: makes the studio installable and works offline.
(function () {
  var CACHE_NAME = 'virtual-bots-v1';
  var SCOPE = self.registration.scope;

  function resolveUrl(path) {
    return new URL(path, SCOPE).href;
  }

  var ASSETS = [
    resolveUrl('./app.html'),
    resolveUrl('./index.html'),
    resolveUrl('./mobile.html'),
    resolveUrl('./manifest.webmanifest'),
    resolveUrl('./icons/app-icon.svg'),
    resolveUrl('./assets/logo.svg'),
    resolveUrl('./vendor/three.min.js')
  ];

  self.addEventListener('install', function (event) {
    event.waitUntil(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.addAll(ASSETS);
      }).then(function () {
        return self.skipWaiting();
      })
    );
  });

  self.addEventListener('activate', function (event) {
    event.waitUntil(
      caches.keys().then(function (keys) {
        return Promise.all(
          keys.filter(function (key) {
            return key !== CACHE_NAME;
          }).map(function (key) {
            return caches.delete(key);
          })
        );
      }).then(function () {
        return self.clients.claim();
      })
    );
  });

  self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    // Only handle same-origin static assets; never intercept the live bridge API.
    if (url.origin !== self.location.origin) return;
    if (url.pathname.split('/').indexOf('api') !== -1) return;
    event.respondWith(
      caches.match(req).then(function (cached) {
        return cached || fetch(req);
      })
    );
  });
})();
