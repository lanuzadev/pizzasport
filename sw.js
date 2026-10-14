/* ═══════════════════════════════════════════════════════════
   sw.js — Service Worker
   Estrategia: red primero, caché como respaldo offline. El caché se
   refresca solo en cada fetch exitoso — a diferencia del cache-first
   anterior, esto YA NO depende de acordarse de bumpear `CACHE` en cada
   deploy: si alguien olvida el bump, las tablets simplemente siguen
   recibiendo el JS más nuevo de la red (que es el comportamiento
   deseado), y solo caen al caché cuando de verdad no hay conexión.
   ═══════════════════════════════════════════════════════════ */
const CACHE = 'pizzasport-shell';
const ASSETS = [
  '/', '/index.html', '/manifest.json',
  '/css/main.css', '/css/components.css', '/css/pos.css', '/css/kitchen.css',
  '/css/dashboard.css', '/css/inventory.css', '/css/print.css', '/css/tables.css',
  '/js/db.js', '/js/state.js', '/js/app.js',
  '/js/utils/escape.js', '/js/utils/notifications.js', '/js/utils/charts.js', '/js/utils/printer.js',
  '/js/modules/tables.js', '/js/modules/pos.js', '/js/modules/kitchen.js', '/js/modules/dashboard.js',
  '/js/modules/customers.js', '/js/modules/marketing.js', '/js/modules/menu.js',
  '/js/modules/cash.js', '/js/modules/inventory.js', '/js/modules/settings.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => key !== CACHE ? caches.delete(key) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Solo interceptamos GET del mismo origen. /api/* siempre va directo a
  // red — nunca debe servirse desde caché (datos autenticados/en vivo).
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
