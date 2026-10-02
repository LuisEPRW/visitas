// Guarda la app en el teléfono para que abra sin cobertura.
// Al cambiar cualquier fichero de la app hay que subir este número de versión;
// si no, los teléfonos seguirán usando la copia antigua.
const CACHE = 'visitas-luis-v10';
const FICHEROS = [
  './', './index.html', './estilos.css', './datos.js', './app.js', './manifest.webmanifest',
  './iconos/icono-180.png', './iconos/icono-192.png', './iconos/icono-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FICHEROS.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true })
      .then((guardado) => guardado || fetch(e.request)),
  );
});
