// sw.js – Service Worker für Achtsamkeits-App
// Strategie: Cache-First für App-Shell, dann Netz für Schriften
// Version hochzählen bei Änderungen an index.html → erzwingt Update

const CACHE_NAME = 'achtsamkeit-v1';

// Ressourcen, die sofort gecacht werden (App-Shell)
const SHELL = [
  './index.html',
  './manifest.json'
  // favicon.ico und favicon_512.png werden beim ersten Abruf gecacht
];

// ── Installation ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting(); // Neuen SW sofort aktivieren
});

// ── Aktivierung (alte Caches aufräumen) ───────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch-Strategie ───────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google Fonts: Network-First, Fallback zu Cache
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
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

  // Eigene Dateien: Cache-First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        // Nur 200-OK Antworten cachen
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      });
    })
  );
});
