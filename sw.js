const CACHE_NAME = "prochorder-v1";
const assets = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js"
];

// Sparar filerna i telefonens minne första gången appen startas
self.addEventListener("install", installEvent => {
  installEvent.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      cache.addAll(assets);
    })
  );
});

// Laddar filerna från telefonens minne istället för nätet nästa gång
self.addEventListener("fetch", fetchEvent => {
  fetchEvent.respondWith(
    caches.match(fetchEvent.request).then(res => {
      return res || fetch(fetchEvent.request);
    })
  );
});