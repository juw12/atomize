(function() {
  'use strict';

  const CACHE_NAME = 'pips-v1';
  const ASSETS = [
    './',
    './web.html',
    './index.html',
    './mobile.html',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/pips-icon.svg',
    './icons/apple-touch-icon.png'
  ];

  // Install: cache app shell
  self.addEventListener('install', function(event) {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(function(cache) {
          return cache.addAll(ASSETS);
        })
        .then(function() {
          return self.skipWaiting();
        })
    );
  });

  // Activate: clean old caches, claim clients
  self.addEventListener('activate', function(event) {
    event.waitUntil(
      caches.keys()
        .then(function(cacheNames) {
          return Promise.all(
            cacheNames.filter(function(name) {
              return name !== CACHE_NAME;
            }).map(function(name) {
              return caches.delete(name);
            })
          );
        })
        .then(function() {
          return self.clients.claim();
        })
    );
  });

  // Fetch: cache-first with network fallback
  self.addEventListener('fetch', function(event) {
    // Only handle same-origin and GET requests
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === self.location.origin;

    if (!isSameOrigin) return;

    event.respondWith(
      caches.match(event.request)
        .then(function(cachedResponse) {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Network fallback
          return fetch(event.request)
            .then(function(networkResponse) {
              // Cache successful responses
              if (networkResponse && networkResponse.status === 200) {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then(function(cache) {
                    cache.put(event.request, responseClone);
                  });
              }
              return networkResponse;
            });
        })
        .catch(function() {
          // Offline fallback for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./web.html')
              .then(function(page) {
                return page || caches.match('./index.html');
              });
          }
          // Return nothing for non-navigation requests when offline
          return new Response('Offline', { status: 503 });
        })
    );
  });
})();
