const CACHE_NAME = "prochorder-v13"; // <-- BYT DENNA SIFFRA VID VARJE UPPDATERING PÅ GITHUB
const assets = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js"
];

// Installera och spara filerna
self.addEventListener("install", installEvent => {
  installEvent.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(assets);
    })
  );
  self.skipWaiting(); // Tvingar den nya versionen att ta över direkt
});

// STÄDAR BORT GAMLA VERSIONER
self.addEventListener("activate", activateEvent => {
  activateEvent.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Hämta filer (Network First-strategi under utveckling är smidigast)
self.addEventListener("fetch", fetchEvent => {
  fetchEvent.respondWith(
    fetch(fetchEvent.request).catch(() => {
      return caches.match(fetchEvent.request);
    })
  );
});
