// Guarda la app en el teléfono para que abra sin cobertura. Con cobertura
// siempre trae la última versión publicada, así que no hace falta tocar
// este número al cambiar la app.
const CACHE = 'visitas-luis-v13';
const FICHEROS = [
  './', './index.html', './estilos.css', './datos.js', './nube.js', './app.js', './manifest.webmanifest',
  './iconos/icono-180-b.png', './iconos/logo-96.png', './iconos/icono-192-b.png', './iconos/icono-512-b.png',
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
  e.respondWith(primeroLaRed(e.request));
});

// Primero la red, para que los cambios lleguen solos al abrir la app. Sin
// cobertura, o si tarda más de 4 segundos, se usa la copia del teléfono.
async function primeroLaRed(peticion) {
  const cache = await caches.open(CACHE);
  // La marca de tiempo salta también la caché de GitHub (hasta 10 minutos).
  const url = peticion.url + (peticion.url.includes('?') ? '&' : '?') + 'v=' + Date.now();
  const red = fetch(url, { cache: 'no-store' }).then((respuesta) => {
    if (respuesta.ok) cache.put(peticion, respuesta.clone());
    return respuesta;
  });
  const espera = new Promise((ok) => setTimeout(ok, 4000));
  try {
    const respuesta = await Promise.race([red, espera]);
    if (respuesta && respuesta.ok) return respuesta;
  } catch (e) {
    // Sin conexión: se sigue con la copia guardada.
  }
  return (await cache.match(peticion, { ignoreSearch: true })) || red;
}
