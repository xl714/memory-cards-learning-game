// Service worker : app shell en cache-first, images en stale-while-revalidate.
const VERSION = 'v1';
const SHELL_CACHE = `idol-memory-shell-${VERSION}`;
const IMG_CACHE = `idol-memory-img-${VERSION}`;

const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/memory.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== IMG_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Portraits (cross-origin) : stale-while-revalidate — les réponses opaques sont mises en cache
  // pour que le jeu fonctionne hors ligne après un premier chargement.
  if (url.hostname === 'api.images.cat') {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // App shell : cache-first, complété par le réseau.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }))
  );
});
