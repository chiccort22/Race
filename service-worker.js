const CACHE = 'race-pwa-v3-offline';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

// Recursos externos usados por la app. Se intentan guardar durante la instalación
// y también se guardan automáticamente cuando la app los solicita con Internet.
const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700;800&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL_ASSETS);

    // Una dependencia externa nunca debe impedir que se instale la PWA.
    await Promise.allSettled(EXTERNAL_ASSETS.map(async url => {
      const response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
      if (response && response.ok) await cache.put(url, response.clone());
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const request = event.request;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navegación: red si está disponible; index.html si estamos offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch (e) {
        return (await caches.match(request)) ||
               (await caches.match('./index.html')) ||
               (await caches.match('./'));
      }
    })());
    return;
  }

  // Archivos propios: caché primero para que la interfaz arranque instantáneamente offline.
  if (sameOrigin) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (e) {
        return Response.error();
      }
    })());
    return;
  }

  // CDN / Google Fonts: usa caché offline y actualízala cuando haya Internet.
  if (url.protocol === 'https:') {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) {
        // Actualización silenciosa; no bloquea la respuesta cacheada.
        event.waitUntil((async () => {
          try {
            const fresh = await fetch(request);
            if (fresh && (fresh.ok || fresh.type === 'opaque')) {
              const cache = await caches.open(CACHE);
              await cache.put(request, fresh.clone());
            }
          } catch (e) {}
        })());
        return cached;
      }

      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (e) {
        return Response.error();
      }
    })());
  }
});
