const CACHE_NAME = "grain-static-v3";
const STATIC_ASSETS = [
  "/favicon.ico",
  "/icon",
  "/manifest.webmanifest",
  "/next.svg",
  "/globe.svg",
  "/file.svg",
  "/window.svg",
  "/vercel.svg",
];

function shouldHandleAsset(request, requestUrl) {
  if (request.method !== "GET") return false;
  if (requestUrl.origin !== self.location.origin) return false;
  if (request.mode === "navigate") return false;
  if (requestUrl.pathname.startsWith("/_next/")) return false;
  if (requestUrl.pathname === "/sw.js") return false;

  return (
    request.destination === "image" ||
    request.destination === "font" ||
    request.destination === "manifest" ||
    STATIC_ASSETS.includes(requestUrl.pathname)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        STATIC_ASSETS.map(async (path) => {
          try {
            const response = await fetch(path, { cache: "no-store" });
            if (!response.ok) return;
            await cache.put(path, response);
          } catch {
            // Ignore individual failures during install.
          }
        }),
      );

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (!shouldHandleAsset(event.request, requestUrl)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkRequest = fetch(event.request)
        .then((response) => {
          if (!response.ok) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);

      return cached ?? networkRequest;
    }),
  );
});
