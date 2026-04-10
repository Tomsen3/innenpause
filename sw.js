// sw.js – Service Worker für Innenpause
// ⚠️  WICHTIG: CACHE_VERSION bei jedem Deploy von index.html hochzählen!
//     Gleiche Nummer wie APP_VERSION in index.html verwenden.
//     Beispiel: index.html → APP_VERSION = '1.3'
//               sw.js      → CACHE_VERSION = 'v1.3'
//     Dann beide Dateien auf GitHub pushen.

const CACHE_VERSION = 'v1.2';
const CACHE_NAME = 'innenpause-' + CACHE_VERSION;

// Ressourcen die sofort gecacht werden (App-Shell)
const SHELL = [
  './index.html',
  './manifest.json'
];

// ── Installation ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
  );
  // Neuen SW sofort aktivieren, ohne auf Tab-Schließung zu warten
  self.skipWaiting();
});

// ── Aktivierung (alle alten Caches löschen) ───────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)  // alles außer aktuellem Cache löschen
          .map(k => {
            console.log('[SW] Alter Cache gelöscht:', k);
            return caches.delete(k);
          })
      )
    )
  );
  // SW übernimmt sofort alle offenen Tabs
  self.clients.claim();
});

// ── Fetch-Strategie ───────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // index.html: immer Network-First → stellt sicher dass Updates ankommen
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          // Neue Version im Cache ablegen
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => {
          // Offline-Fallback: gecachte Version
          return caches.match('./index.html');
        })
    );
    return;
  }

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

  // Alle anderen Dateien (manifest, icons): Cache-First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      });
    })
  );
});
