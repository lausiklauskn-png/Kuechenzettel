/*
 * Kochfreunde — Service Worker (offline-first App-Schale).
 * Cache-first für die eigene Schale (die App läuft ohne Netz weiter);
 * fremde Origins (nichts hier) werden nie abgefangen. Bei Schalen-Änderung
 * CACHE_VERSION erhöhen. WebSocket-Relais-Verkehr geht am SW vorbei (er
 * fängt nur GET-Navigations-/Asset-Requests ab).
 */
const CACHE_VERSION = "kuechenzettel-v5";
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
  /* SBKIM-Knoten (Sage PFLICHT_MODULE, Falle 4): alles im Vorrat. noble ohne ?v= — 05b holt es per import ohne Zusatz. */
  "./assets/sbkim.css?v=5", "./assets/sbkim-init.js?v=5", "./assets/siegel-inhalt.js?v=5", "./modules/noble-secp256k1.js",
  "./modules/01_storage.js?v=5", "./modules/02_spore.js?v=5", "./modules/03_embedding.js?v=5", "./modules/04_match.js?v=5",
  "./modules/05_anastomose.js?v=5", "./modules/05b_nostr_relay.js?v=5", "./modules/07_apoptose.js?v=5", "./modules/15_membran.js?v=5",
  "./modules/16_siegel.js?v=5", "./modules/16b_andock_wizard.js?v=5", "./modules/23_rendezvous.js?v=5", "./modules/23_rendezvous_ui.js?v=5",
  "./sicherheit.html",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
/* ⚠ NUR EIGENE VORRAETE AUFRAEUMEN — `caches` gehoert dem URSPRUNG, nicht dem
 * Pfad. Auf lausiklauskn-png.github.io liegen rund zwanzig Apps; ein Filter
 * `k !== CACHE_VERSION` laesst ALLE fremden durch und loescht sie.
 *
 * Gemessen am 2026-09-08 (Sage-Protokol/tests/vorrat_wirkung.mjs): diese App
 * nur zu OEFFNEN loeschte den Vorrat von mycel-karte. Kein Datenverlust, aber
 * die Geschwister-App war bis zum naechsten Online-Besuch nicht mehr
 * offline-faehig.
 *
 * Das Praefix ist aus CACHE_VERSION ABGELESEN, nicht geraten. Muster kopiert
 * aus Tomys-Hub/bookledger/sw.js — es steht im Netz schon an vier Stellen.
 *
 * ⚠ ES MUSS BEIDES TUN: fremde Vorraete stehen lassen UND die eigenen alten
 * weiter wegraeumen. Ein zu enges Praefix laesst sie ewig wachsen — derselbe
 * Fehler, nur andersherum. */
const VORRAT_PRAEFIX = "kuechenzettel-";
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys
      .filter(k => k.startsWith(VORRAT_PRAEFIX) && k !== CACHE_VERSION)
      .map(k => caches.delete(k)))
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
