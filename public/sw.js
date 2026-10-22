const CACHE_NAME = 'gardes-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS);
      })
      .catch((err) => {
        console.error('SW Install Error:', err);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName).catch(() => {});
          }
        })
      );
    })
    .then(() => self.clients.claim())
    .catch((err) => {
      console.error('SW Activate Error:', err);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  // Navigation requests (like index.html) should be Network First
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/').then(response => response || Response.error());
      })
    );
    return;
  }

  // Other assets can be Cache First
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => Response.error());
    })
  );
});
