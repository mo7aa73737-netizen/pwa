const CACHE_NAME = 'ysk-mobile-pwa-v2';
const ASSETS = [
  './index.html',
  './app.js',
  './manifest.json'
];

// Cache external resources separately to avoid CORS issues
const EXTERNAL_ASSETS = [
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => {
        // Try to cache external assets, but don't fail if they can't be cached
        return caches.open(CACHE_NAME).then(cache => {
          return Promise.allSettled(
            EXTERNAL_ASSETS.map(url => 
              fetch(url).then(response => {
                if (response.ok) {
                  return cache.put(url, response);
                }
              }).catch(() => {
                console.log('Failed to cache:', url);
              })
            )
          );
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Network-first for app shell local files, cache-first for CDNs
  const isLocal = request.url.startsWith(self.location.origin);
  if (isLocal) {
    event.respondWith(
      fetch(request).then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return resp;
      }).catch(() => caches.match(request))
    );
  } else {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return resp;
      }))
    );
  }
});
