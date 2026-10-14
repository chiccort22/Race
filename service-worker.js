// Inicio inmediato desde caché; actualización de HTML en segundo plano.
const CACHE = 'race-pwa-v3-offline-v3';
const PREFIX = 'race-pwa-v3-offline-';
const HOME = new URL('./index.html', self.registration.scope).href;
const SHELL = [HOME, new URL('./manifest.webmanifest', self.registration.scope).href];

self.addEventListener('install', event => {
  // No bloqueamos la instalación por una red lenta ni por iconos ausentes.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

async function cachedHome() {
  const current = await caches.open(CACHE);
  let hit = await current.match(HOME);
  if (hit) return hit;
  // Conservar el HTML de la versión anterior durante la migración.
  const keys = (await caches.keys()).filter(k => k.startsWith(PREFIX) && k !== CACHE);
  for (const key of keys) {
    hit = await (await caches.open(key)).match(HOME);
    if (hit) {
      await current.put(HOME, hit.clone());
      return hit;
    }
  }
  return null;
}

async function refreshHome() {
  const response = await fetch(HOME, {cache: 'no-store'});
  if (response.ok && response.type !== 'opaque') {
    const cache = await caches.open(CACHE);
    await cache.put(HOME, response.clone());
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !/^https?:/.test(req.url)) return;
  const url = new URL(req.url);
  const local = url.origin === self.location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
  const navigation = req.mode === 'navigate' || (local && (url.pathname === new URL(HOME).pathname || url.pathname === new URL(self.registration.scope).pathname));

  if (navigation) {
    event.respondWith((async () => {
      const cached = await cachedHome();
      if (cached) {
        event.waitUntil(refreshHome().catch(() => {}));
        return cached;
      }
      // Primera apertura: aún no hay HTML local.
      try {
        const response = await fetch(req);
        if (response.ok) await (await caches.open(CACHE)).put(HOME, response.clone());
        return response;
      } catch (_) {
        return new Response('Sin conexión. Abre la aplicación una vez con internet para guardar sus archivos.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
      }
    })());
    return;
  }

  // Los recursos externos (Tailwind, fuentes, etc.) se reutilizan si ya se descargaron.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req) || await caches.match(req);
    if (cached) return cached;
    try {
      const response = await fetch(req);
      if (response.ok || response.type === 'opaque') event.waitUntil(cache.put(req, response.clone()).catch(() => {}));
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
