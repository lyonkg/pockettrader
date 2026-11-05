// Minimal offline-capable service worker for the PocketTrader PWA.
const CACHE = 'pockettrader-gh-pockettrader-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/pockettrader/","/pockettrader/manifest.json","/pockettrader/icon-192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache market-data APIs
  if (url.pathname.endsWith('.apk') || url.pathname.endsWith('.zip')) return;
  // Network first (so new builds always show up), cache fallback for offline use.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? '/pockettrader/' : req, copy)); }
        return res;
      })
      .catch(() => caches.match(req.mode === 'navigate' ? '/pockettrader/' : req)),
  );
});
