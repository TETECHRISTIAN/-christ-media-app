// ─── CHRIST MEDIA — SERVICE WORKER ───
const CACHE_NAME = 'christmedia-v4';
const BASE = '/-christ-media-app';

const ASSETS_TO_CACHE = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/icons/icon-192x192.png',
  BASE + '/icons/icon-512x512.png',
];

// ─── INSTALLATION ───
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('SW: certains fichiers non mis en cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATION ───
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ───
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Laisser passer Firebase, Cloudinary, APIs externes
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firebaseio') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('cloudinary') ||
    url.hostname.includes('qrserver') ||
    url.protocol === 'chrome-extension:'
  ) return;

  // CDN (fonts, scripts) — Cache First
  if (
    url.hostname.includes('fonts.googleapis') ||
    url.hostname.includes('fonts.gstatic') ||
    url.hostname.includes('cdnjs.cloudflare') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdn.jsdelivr')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // App locale — Network First avec fallback cache
  event.respondWith(
    fetch(event.request).then(res => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
      }
      return res;
    }).catch(() =>
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match(BASE + '/index.html');
        }
        return new Response('Hors ligne', { status: 503 });
      })
    )
  );
});

// ─── MESSAGES ───
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
