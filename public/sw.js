// sw.js — service worker for offline + low-bandwidth use on old phones.
//
// Strategy:
// - App shell + static assets: cache-first (instant, works offline, saves data).
// - GET /api/rules and /api/jurisdictions: network-first, fall back to cache, so
//   the rules a person needs are available offline after the first successful load.
// - POST endpoints (/api/discovery, /api/explain): never cached (they need the
//   network and the model; the app degrades to the on-device screener when offline).

const CACHE = "navigator-v1";
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/js/app.js",
  "/js/screener.js",
  "/i18n/en.json",
  "/i18n/es.json",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // let POSTs go straight to network

  const url = new URL(request.url);

  // Rules / jurisdictions: network-first, cache fallback.
  if (url.pathname === "/api/rules" || url.pathname === "/api/jurisdictions") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Don't cache the health probe.
  if (url.pathname.startsWith("/api/")) return;

  // Static: cache-first, then network (and cache it).
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }).catch(() => caches.match("/index.html"))
    )
  );
});
