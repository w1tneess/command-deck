// Offline shell: static files are cached as they are used, and the last good /api/state is
// served when the server can't be reached. Writes are never queued; they fail with a clear message.
const CACHE = "command-deck-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  ),
);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const isState = url.pathname === "/api/state";
  if (url.pathname.startsWith("/api/") && !isState) return;

  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = (await cache.match(req)) ?? (req.mode === "navigate" ? await cache.match("/") : undefined);
        if (hit) return hit;
        throw new Error("offline");
      }
    })(),
  );
});
