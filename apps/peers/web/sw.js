(function(){
  var CACHE_NAME = 'peers-v1';
  var SCOPE = self.registration.scope;

  function resolveUrl(path){
    return new URL(path, SCOPE).href;
  }

  var ASSETS = [
    resolveUrl('./app.html'),
    resolveUrl('./index.html'),
    resolveUrl('./mobile.html'),
    resolveUrl('./manifest.webmanifest'),
    resolveUrl('./icons/app-icon.svg')
  ];

  self.addEventListener('install', function(event){
    event.waitUntil(
      caches.open(CACHE_NAME).then(function(cache){
        return cache.addAll(ASSETS);
      }).then(function(){
        return self.skipWaiting();
      })
    );
  });

  self.addEventListener('activate', function(event){
    event.waitUntil(
      caches.keys().then(function(keys){
        return Promise.all(
          keys.filter(function(key){
            return key !== CACHE_NAME;
          }).map(function(key){
            return caches.delete(key);
          })
        );
      }).then(function(){
        return self.clients.claim();
      })
    );
  });

  self.addEventListener('fetch', function(event){
    var request = event.request;

    if (request.method !== 'GET') {
      return;
    }

    var url = new URL(request.url);

    if (request.mode === 'navigate') {
      event.respondWith(
        fetch(request).catch(function(){
          return caches.match(resolveUrl('./index.html'));
        })
      );
      return;
    }

    if (url.pathname.endsWith('.html') || request.headers.get('accept').indexOf('text/html') !== -1) {
      event.respondWith(
        fetch(request).then(function(response){
          if (response.ok) {
            var responseClone = response.clone();
            caches.open(CACHE_NAME).then(function(cache){
              cache.put(request, responseClone);
            });
          }
          return response;
        }).catch(function(){
          return caches.match(request).then(function(cached){
            return cached || caches.match(resolveUrl('./index.html'));
          });
        })
      );
      return;
    }

    event.respondWith(
      caches.match(request).then(function(cached){
        return cached || fetch(request).then(function(response){
          if (response.ok) {
            var responseClone = response.clone();
            caches.open(CACHE_NAME).then(function(cache){
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
  });
})();
