// Offline support. The game's own files are network-first, so a new version
// shows up on the next load when online; if the network is slow or gone, the
// cached copy is used. The pinned three.js build on unpkg never changes, so it
// is cache-first. Everything is cached the first time it loads, so one online
// visit is enough for the village to open offline.
const CACHE = 'rcv-v1';
const NET_TIMEOUT_MS = 4000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'unpkg.com' && /@\d+\.\d+\.\d+\//.test(url.pathname)) e.respondWith(cacheFirst(req));
  else if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
  net.catch(() => {}); // handled below; don't report an unhandled rejection if the cache answered first
  const cached = cache.match(req, { ignoreSearch: true });
  const slow = new Promise((r) => setTimeout(r, NET_TIMEOUT_MS)).then(() => cached);
  try {
    return (await Promise.race([net, slow])) || (await net);
  } catch {
    return (await cached) || Response.error();
  }
}
