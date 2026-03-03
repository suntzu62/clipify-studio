// Simple service worker for caching static assets
const CACHE_NAME = 'cortai-v1';
const STATIC_CACHE = [
  '/',
  '/src/critical.css',
  '/src/index.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_CACHE))
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  // Cache static assets
  if (event.request.url.includes('/src/') || 
      event.request.url.includes('/assets/') ||
      event.request.url.includes('.css') ||
      event.request.url.includes('.js')) {
    
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // Return cached version or fetch from network
          return response || fetch(event.request);
        })
    );
  }
});