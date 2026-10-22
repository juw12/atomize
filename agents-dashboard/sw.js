// Virtual Bots Office - minimal service worker.
// Purpose: make the dashboard installable as an app (PWA). No offline caching
// is done on purpose, so the app always talks to the live bridge.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
