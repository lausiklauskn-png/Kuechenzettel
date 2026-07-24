/*
 * Kochfreunde — Service Worker (offline-first App-Schale).
 * Cache-first für die eigene Schale (die App läuft ohne Netz weiter);
 * fremde Origins (nichts hier) werden nie abgefangen. Bei Schalen-Änderung
 * CACHE_VERSION erhöhen. WebSocket-Relais-Verkehr geht am SW vorbei (er
 * fängt nur GET-Navigations-/Asset-Requests ab).
 */
const CACHE_VERSION = "kuechenzettel-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./comm-core/comm-core.js",
  "./comm-core/relay-transport.js",
  "./comm-core/vendor/noble-secp256k1.js",
  "./comm-core/vendor/dm_crypto.js",
  "./comm-core/vendor/jasonlib.js",
  "./comm-core/vendor/20_schluessel_safe.js",
  "./comm-core/vendor/21_spracheingabe.js",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return; // nie fremde Origins
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then(c => { try { c.put(e.request, copy); } catch (x) {} });
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
