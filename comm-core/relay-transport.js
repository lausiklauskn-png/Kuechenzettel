/*
 * comm-core — Transport (Simulator-Stufe A)
 * ------------------------------------------------------------------------
 * Server-loser Nostr-Relais-Client nach dem Muster von Sage-Protokol
 * Modul 05b (src/modules/05b_nostr_relay.js) + Pinnwand-Board
 * (Sage-Protokol/pinnwand/index.html) — ABER mit zwei bewussten,
 * plan-vorgeschriebenen Abweichungen (Plan §"Frage 4 — Transport"):
 *
 *   1. Relais-Liste EINGEBACKEN (RELAYS unten), NICHT live von GitHub
 *      geladen und OHNE relay.family-projekt.de (trägt Projektnamen,
 *      blockierbar). Die Liste stammt aus dem öffentlichen Relais-Pool
 *      des Pinnwand-Boards, family-projekt entfernt.
 *   2. Berechnete Reihenfolge: beide Seiten leiten aus Startwert + Zeit
 *      offline dieselbe Relais-Reihenfolge ab (relayOrder). Kein
 *      verräterisches "ich wechsle jetzt".
 *
 * Async Store-and-Forward: der Sender publisht ein Ereignis, das Relais
 * hält es vor; der Empfänger holt es später über subscribe(since:...) —
 * das Relais IST der Briefkasten. Das Relais sieht nur den namenlosen
 * E2E-Chiffrat-Klumpen (dm_crypto, in comm-core.js verpackt).
 *
 * KRYPTO-TRENNUNG (wie 05b): der hier erzeugte schnorr-Schlüssel ist
 * EPHEMER (pro Instanz neu) und NUR ein Transport-Umschlag. Er beweist
 * NICHTS über die Identität — die liegt im E2E-verschlüsselten content.
 *
 * Empfangsmodus: baut KEINE Verbindung beim Laden auf. Erst
 * publish()/subscribe() (bewusste Nutzer-Aktion) öffnet die WebSocket.
 * Kein Dauer-Piepser, keine Pulsation.
 *
 * DOM-frei + fail-soft + testbar: `makeSocket` ist injizierbar (Default
 * global WebSocket), damit ein In-Memory-Mock-Relais headless prüfbar ist.
 *
 * VERBOTEN (Plan): relay.family-projekt.de · Live-Liste von GitHub ·
 * echte Handy-SMS.
 */
import { schnorr, utils } from "./vendor/noble-secp256k1.js";

// Eingebackener öffentlicher Relais-Pool (Pinnwand-Liste OHNE family-projekt).
export const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
  "wss://nostr.mom",
  "wss://offchain.pub",
  "wss://relay.mostr.pub",
];

// Zeit-Fenster für die Relais-Rotation (Default 6 h). Beide Seiten rechnen
// mit demselben Fenster → dieselbe Reihenfolge im selben Fenster.
export const RELAY_WINDOW_MS = 6 * 60 * 60 * 1000;

function toHex(bytes) {
  var s = "";
  for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}
function fromHex(h) {
  var a = new Uint8Array(h.length / 2);
  for (var i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return a;
}

// Kleiner deterministischer 32-bit-Hash (FNV-1a) über einen String — nur für
// die Reihenfolge-Berechnung, NICHT für Krypto.
function fnv1a(str) {
  var h = 0x811c9dc5 >>> 0;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// Zeit-Fenster-Index aus einem Zeitstempel (ms).
export function timeBucket(nowMs, windowMs) {
  var w = windowMs || RELAY_WINDOW_MS;
  return Math.floor((typeof nowMs === "number" ? nowMs : 0) / w);
}

// Deterministische Relais-Reihenfolge aus Startwert (seed) + Fenster (bucket).
// Beide Seiten mit gleichem seed+bucket bekommen dieselbe Reihenfolge — kein
// abgestimmtes "ich wechsle jetzt" nötig. Reine Funktion (offline berechenbar).
export function relayOrder(seed, bucket, relays) {
  var list = (relays && relays.length ? relays : RELAYS).slice();
  var base = String(seed == null ? "" : seed) + "|" + String(bucket == null ? 0 : bucket);
  return list
    .map(function (url) { return { url: url, rank: fnv1a(base + "|" + url) }; })
    .sort(function (a, b) { return a.rank - b.rank || (a.url < b.url ? -1 : 1); })
    .map(function (x) { return x.url; });
}

function getWebSocket() {
  if (typeof WebSocket !== "undefined") return WebSocket;
  if (typeof globalThis !== "undefined" && globalThis.WebSocket) return globalThis.WebSocket;
  return null;
}

async function sha256Hex(str) {
  var bytes = new TextEncoder().encode(str);
  var c = (typeof crypto !== "undefined" && crypto.subtle) ? crypto :
    (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle ? globalThis.crypto : null);
  if (!c) throw new Error("Kein SHA-256 verfügbar (WebCrypto fehlt).");
  var buf = await c.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(buf));
}

/*
 * makeTransport(opts) → { publish, subscribe, close, tryNextOnFail, _meta }
 *
 * opts:
 *   relays      : eingebackene Liste überschreiben (Default RELAYS)
 *   seed        : Startwert für die Reihenfolge (z.B. Paar-Ablage-Wurzel)
 *   now         : () => ms  (injizierbar für Tests)
 *   windowMs    : Rotations-Fenster
 *   makeSocket  : (url) => WebSocket-artig (injizierbar für Mock)
 */
export function makeTransport(opts) {
  opts = opts || {};
  var relays = (opts.relays && opts.relays.length ? opts.relays : RELAYS).slice();
  var seed = opts.seed != null ? String(opts.seed) : "comm-core";
  var now = typeof opts.now === "function" ? opts.now : function () {
    // Date.now nur, wenn kein Injekt — für Tests immer injizieren.
    return (typeof Date !== "undefined" && Date.now) ? Date.now() : 0;
  };
  var windowMs = opts.windowMs || RELAY_WINDOW_MS;
  var SocketCtor = typeof opts.makeSocket === "function" ? null : getWebSocket();
  var makeSocket = typeof opts.makeSocket === "function"
    ? opts.makeSocket
    : function (url) { return SocketCtor ? new SocketCtor(url) : null; };

  // Ephemerer Transport-Schlüssel (pro Instanz neu) — NUR Umschlag.
  var priv = utils.randomPrivateKey();
  var pubHex = toHex(schnorr.getPublicKey(priv));

  var conns = {};       // url -> socket
  var subs = [];        // aktive Subscriptions
  var subCounter = 0;
  var failOffset = 0;   // von tryNextOnFail hochgezählt

  // Aktuell bevorzugte Relais-Reihenfolge (Startwert + Zeitfenster + Fail-Offset).
  function currentOrder() {
    var bucket = timeBucket(now(), windowMs) + failOffset;
    return relayOrder(seed, bucket, relays);
  }

  function liveSockets() {
    var out = [];
    for (var url in conns) {
      var ws = conns[url];
      if (ws && ws.readyState === 1) out.push(ws);
    }
    return out;
  }

  function ensureConnections() {
    return new Promise(function (resolve) {
      var order = currentOrder();
      var pending = 0;
      var resolved = false;
      function maybeResolve() {
        if (resolved) return;
        if (liveSockets().length > 0 || pending === 0) {
          resolved = true;
          resolve(liveSockets());
        }
      }
      order.forEach(function (url) {
        var existing = conns[url];
        if (existing && (existing.readyState === 0 || existing.readyState === 1)) {
          if (existing.readyState === 1) maybeResolve();
          return;
        }
        pending++;
        var ws;
        try { ws = makeSocket(url); } catch (e) { pending--; maybeResolve(); return; }
        if (!ws) { pending--; maybeResolve(); return; }
        conns[url] = ws;
        ws.onopen = function () {
          pending = Math.max(0, pending - 1);
          subs.forEach(function (s) {
            try { ws.send(JSON.stringify(["REQ", s.id, s.filter])); } catch (e2) {}
          });
          maybeResolve();
        };
        ws.onmessage = function (e) {
          var m;
          try { m = JSON.parse(e.data); } catch (e3) { return; }
          if (!Array.isArray(m)) return;
          if (m[0] === "EVENT" && typeof m[1] === "string" && m[2]) dispatch(m[1], m[2]);
        };
        ws.onclose = function () { /* kein Auto-Reconnect-Daemon */ };
        ws.onerror = function () { /* onclose folgt */ };
      });
      if (order.length === 0) maybeResolve();
      setTimeout(maybeResolve, 6000);
    });
  }

  function dispatch(subId, ev) {
    for (var i = 0; i < subs.length; i++) {
      var s = subs[i];
      if (s.id !== subId) continue;
      if (ev && ev.id && s.seen.has(ev.id)) continue;
      if (ev && ev.id) s.seen.add(ev.id);
      try { s.onEvent(ev); } catch (e) { /* fail-soft */ }
    }
  }

  async function finalizeEvent(body) {
    var kind = typeof body.kind === "number" ? body.kind : 1;
    var created_at = typeof body.created_at === "number"
      ? body.created_at : Math.floor(now() / 1000);
    var tags = Array.isArray(body.tags) ? body.tags : [];
    var content = typeof body.content === "string" ? body.content : "";
    var id = await sha256Hex(JSON.stringify([0, pubHex, created_at, kind, tags, content]));
    var sig = toHex(await schnorr.sign(fromHex(id), priv));
    return { id: id, pubkey: pubHex, created_at: created_at, kind: kind, tags: tags, content: content, sig: sig };
  }

  async function publish(body) {
    var ev = await finalizeEvent(body);
    await ensureConnections();
    var live = liveSockets();
    if (live.length === 0) throw new Error("Kein Relais verbunden — Publish nicht möglich.");
    var msg = JSON.stringify(["EVENT", ev]);
    for (var i = 0; i < live.length; i++) {
      try { live[i].send(msg); } catch (e) { /* einzelnes Relais down */ }
    }
    return ev;
  }

  function subscribe(filter, onEvent) {
    var id = "cc-" + (++subCounter);
    var sub = { id: id, filter: filter, onEvent: onEvent, seen: new Set() };
    subs.push(sub);
    ensureConnections().then(function () {
      liveSockets().forEach(function (ws) {
        try { ws.send(JSON.stringify(["REQ", id, filter])); } catch (e) {}
      });
    });
    return function unsubscribe() {
      var idx = subs.indexOf(sub);
      if (idx !== -1) subs.splice(idx, 1);
      liveSockets().forEach(function (ws) {
        try { ws.send(JSON.stringify(["CLOSE", id])); } catch (e) {}
      });
    };
  }

  // Bei Fehlschlag: gemeinsam ein Fenster weiterrücken (beide Seiten rechnen
  // dieselbe nächste Reihenfolge). Schließt offene Sockets, die nächste
  // publish/subscribe öffnet nach der neuen Reihenfolge.
  function tryNextOnFail() {
    failOffset++;
    for (var url in conns) { try { conns[url].close(); } catch (e) {} }
    conns = {};
    return currentOrder();
  }

  function close() {
    subs.length = 0;
    for (var url in conns) { try { conns[url].close(); } catch (e) {} }
    conns = {};
  }

  return {
    publish: publish,
    subscribe: subscribe,
    tryNextOnFail: tryNextOnFail,
    close: close,
    _meta: {
      transportPubKey: pubHex,      // ephemer (NICHT Identität)
      get relays() { return relays.slice(); },
      get order() { return currentOrder(); },
      get liveCount() { return liveSockets().length; },
    },
  };
}
