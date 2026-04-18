// ─── CHRIST MEDIA — SERVICE WORKER ───
// Version du cache — incrementer pour forcer la mise à jour
const CACHE_NAME = 'christmedia-v3';

// Fichiers à mettre en cache pour le mode hors-ligne
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  // CDN externes mis en cache automatiquement lors de la première visite
];

// ─── INSTALLATION ───
// Met en cache les fichiers essentiels au démarrage
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        // Si certains fichiers manquent (ex: icônes), ignorer l'erreur
        console.warn('SW: certains fichiers non mis en cache:', err);
      });
    }).then(() => {
      // Prendre le contrôle immédiatement sans attendre le rechargement
      return self.skipWaiting();
    })
  );
});

// ─── ACTIVATION ───
// Supprime les anciens caches lors d'une mise à jour
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('SW: suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Prendre le contrôle de toutes les pages ouvertes
      return self.clients.claim();
    })
  );
});

// ─── STRATÉGIE DE CACHE ───
// Network First pour les données Firebase (toujours fraîches)
// Cache First pour les assets statiques (rapide)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;

  // Ignorer Firebase, Cloudinary et autres APIs — toujours réseau
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firebaseio') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('cloudinary') ||
    url.hostname.includes('qrserver') ||
    url.hostname.includes('wa.me') ||
    url.protocol === 'chrome-extension:'
  ) {
    return; // Pas d'interception — laisser passer
  }

  // Pour les CDN (fonts, scripts) — Cache First avec fallback réseau
  if (
    url.hostname.includes('fonts.googleapis') ||
    url.hostname.includes('fonts.gstatic') ||
    url.hostname.includes('cdnjs.cloudflare') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdn.jsdelivr') ||
    url.hostname.includes('gstatic.com')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Pour l'app elle-même (index.html, manifest, icônes) — Network First
  // Si le réseau échoue, utiliser le cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Mettre à jour le cache avec la version fraîche
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Réseau indisponible — utiliser le cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback vers index.html pour la navigation
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Hors ligne', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// ─── MESSAGE DU CLIENT ───
// Permet de forcer la mise à jour depuis l'app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
