// ─── CHRIST MEDIA SERVICE WORKER v11 ───
const CACHE_NAME = 'christmedia-v11';
const CACHE_STATIC = 'christmedia-static-v11';

// Ressources à mettre en cache au démarrage
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  // Bibliothèques CDN critiques
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap',
];

// ─── INSTALL : mise en cache initiale ───
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        // On cache ce qu'on peut, on ignore les erreurs sur les CDN
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => console.warn('Cache miss:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE : nettoyer les anciens caches ───
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== CACHE_STATIC)
          .map(name => {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH : stratégie Cache First pour assets, Network First pour données ───
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorer les requêtes Firebase (toujours réseau)
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firebaseapp.com') ||
      url.hostname.includes('googleapis.com') && url.pathname.includes('firebase')) {
    return;
  }

  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;

  // index.html → Network First (pour avoir la dernière version)
  if (url.pathname.endsWith('index.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Polices Google Fonts → Cache First
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const cloned = response.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(event.request, cloned));
          return response;
        });
      })
    );
    return;
  }

  // CDN libs (Chart.js, ZXing…) → Cache First longue durée
  if (url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('unpkg.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const cloned = response.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(event.request, cloned));
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Tout le reste → Stale While Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      });
    })
  );
});

// ─── MESSAGE : forcer mise à jour depuis l'app ───
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
    event.ports[0]?.postMessage({ cleared: true });
  }
});
