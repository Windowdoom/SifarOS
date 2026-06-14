// sw.js — service worker for offline + low-bandwidth use on old phones.
//
// Base-aware: works whether the app is served at "/" (the Node server) or under a
// subpath like "/SifarOS/" (GitHub Pages). Paths are derived from the worker's own
// location so the same file works in both places.
//
// Strategy:
// - App shell + static assets: cache-first (instant, offline, saves data).
// - GET /api/rules and /api/jurisdictions (server mode): network-first, cache
//   fallback. On static hosting these don't exist; the page falls back to the
//   bundled data/*.json files, which get cached on first use like any static file.
// - POST endpoints: never cached (they need the network and the model; the app
//   degrades to the on-device screener when offline).

const CACHE = "navigator-v2";
const BASE = self.location.pathname.replace(/sw\.js$/, ""); // e.g. "/" or "/SifarOS/"
const SHELL = [
  BASE,
  BASE + "index.html",
  BASE + "styles.css",
  BASE + "manifest.webmanifest",
  BASE + "js/app.js",
  BASE + "js/screener.js",
  BASE + "i18n/en.json",
  BASE + "i18n/es.json",
  BASE + "icons/icon.svg",
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

  // Server-mode rules endpoints: network-first, cache fallback.
  if (url.pathname.endsWith("/api/rules") || url.pathname.endsWith("/api/jurisdictions")) {
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
  if (url.pathname.includes("/api/")) return;

  // Static (including the bundled data/*.json on Pages): cache-first, then network.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => caches.match(BASE + "index.html"))
    )
  );
});
