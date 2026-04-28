// sw.js - stabilisierte Version (v3.1)

const CACHE_NAME = 'innenpause-v3-1';
const CACHE_PREFIX = 'innenpause-';

const SHELL = [
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/sync-backup.js',
  './js/pdf-export.js',
  './version.json',
  './data/bausteine.json',
  './data/hilfe.json'
];

// INSTALL
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const file of SHELL) {
        try {
          await cache.add(file);
        } catch (e) {
          console.warn('Cache add fehlgeschlagen:', file);
        }
      }
    })
  );
  self.skipWaiting();
});

// ACTIVATE
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // version.json IMMER frisch
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ausgelagerte App-Daten frisch laden, offline aus Cache
  if (url.pathname.endsWith('/data/bausteine.json') || url.pathname.endsWith('/data/hilfe.json')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // index.html = network-first
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // alles andere = cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(res => {
          if (!res || res.status !== 200) return res;

          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));

          return res;
        })
        .catch(() => new Response('Offline', { status: 503 }));
    })
  );
});
