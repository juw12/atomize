// Sweep Service Worker — Offline-first caching
// Network-first for HTML/navigation, cache-first for static assets

const CACHE_NAME = 'sweep-v3-operator';
const ASSETS_TO_CACHE = [
  './app.html',
  './index.html',
  './mobile.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/app-icon.svg'
];

// Determine scope safely (works for subpath deploys)
const SCOPE = self.registration ? self.registration.scope : './';

// Install event — cache core assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[ServiceWorker] Pre-caching assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(function() {
        console.log('[ServiceWorker] Skip waiting');
        return self.skipWaiting();
      })
  );
});

// Activate event — clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames.map(function(cacheName) {
            if (cacheName !== CACHE_NAME) {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(function() {
        console.log('[ServiceWorker] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event — network-first for HTML, cache-first for everything else
self.addEventListener('fetch', function(event) {
  const { request } = event;
  const url = new URL(request.url);
  
  // Only handle GET requests within our scope
  if (request.method !== 'GET') {
    return;
  }
  
  // Check if request is within our scope
  if (!url.pathname.startsWith(SCOPE) && !url.pathname.endsWith(SCOPE)) {
    // For root scope, check if it's a relative path
    const relativePath = url.pathname.replace(SCOPE, '');
    if (!relativePath.startsWith('/') && !relativePath.startsWith('./')) {
      return;
    }
  }
  
  // Network-first for HTML pages and navigation
  if (request.mode === 'navigate' || 
      request.headers.get('accept')?.includes('text/html') ||
      url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // Cache-first for static assets (CSS, JS, images, manifest, icons)
  event.respondWith(cacheFirst(request));
});

// Network-first strategy (for HTML)
async function networkFirst(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // If successful, clone and cache it
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    console.log('[ServiceWorker] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If not in cache, try to serve app.html as fallback (SPA)
    const appHtml = await caches.match('./app.html');
    if (appHtml) {
      return appHtml;
    }
    
    // Last resort: return offline page or error
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Cache-first strategy (for static assets)
async function cacheFirst(request) {
  // Check cache first
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Not in cache, try network
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Fetch failed:', request.url, error);
    
    // Return a generic error response
    return new Response('Asset not available', {
      status: 404,
      statusText: 'Not Found'
    });
  }
}
