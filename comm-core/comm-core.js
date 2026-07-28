/*
 * comm-core — der geteilte Kommunikations-Kern (Stufe A / Simulator)
 * ========================================================================
 * EIN Motor, mehrere Karosserien: dieselbe Datei liegt byte-1:1 in jeder
 * Tarn-Hülle (kochfreund, kuechenzettel) und wird vom Drift-Guard bewacht.
 * Diese Datei DICHTET NICHTS HINZU — sie KOMPONIERT nur die vorhandenen,
 * getesteten Bausteine (Plan §"Wiederverwendbare Bausteine"):
 *
 *   • dm_crypto.js  (Privat-Brain) — newIdentity / dmEncrypt / dmDecrypt /
 *     safetyNumber : ECDH-E2E (secp256k1) + TOFU-Sicherheitsnummer (SAS).
 *   • JasonLib      (Jasons-Tresor) — encryptTresor / decryptTresor
 *     (AES-256-GCM / PBKDF2-SHA256 600k) für die versteckte Ablage +
 *     splitSecret / combineShares (JT3v5 3-von-5) für die Wort-Anteile
 *     des Vertrauens-Kreises.
 *   • SbkimSafe     (Sage Modul 20) — recoverPassword / _shamirSplitBytes /
 *     _shamirCombineBytes : Shamir 2-von-3 für die persönliche
 *     Passwort-Wiederherstellung.
 *   • SbkimSpeech   (Sage Modul 21) — gesprochenes Losungswort → Text
 *     (nur Auslöser; KEINE Stimm-Biometrie als Schloss — Plan §Frage 3).
 *   • relay-transport.js (dieses Repo) — Nostr-Relais-Muster (05b) mit
 *     eingebackener Relais-Liste + berechneter Rotation, OHNE
 *     family-projekt, OHNE Live-GitHub-Liste.
 *
 * ------------------------------------------------------------------------
 * BEWUSSTE PLAN-AUSLEGUNG (transparent, an Klaus im Kontrollpunkt gemeldet):
 * Der Plan nennt Safe Modul 20 auch für "createVault/unlock". Modul 20s
 * Vault ist aber IndexedDB- + Ed25519-gebunden (Modul 01+02) und liegt pro
 * Origin getrennt — er kann das im Plan geforderte App-Hopping (dieselbe
 * Identität in zwei verschiedenen Repos/Origins) prinzipiell NICHT leisten.
 * Darum nutzt comm-core für den Freischalt-Tresor + das tragbare Päckchen
 * dieselbe Krypto-PRIMITIVE, auf der Modul 20 selbst aufsetzt
 * (PBKDF2-600k / AES-GCM-256, hier über JasonLib), als portables Blob.
 * Von Modul 20 wird — wie im Plan benannt — die entkoppelte Shamir-2/3-
 * Passwort-Wiederherstellung byte-1:1 wiederverwendet. Kein neuer Krypto-
 * Baustein, keine neue Richtung.
 *
 * ------------------------------------------------------------------------
 * EHRLICHE GRENZEN (Plan §"Ehrliche Grenzen" — NICHT beschönigen):
 *   • Der Simulator beweist die MECHANIK, NICHT die Tarnung gegen ein echtes
 *     Regime (entworfen, nicht getestet).
 *   • App-Hopping schlägt App-Verbote, NICHT Netz-Fingerprinting.
 *   • Der server-lose "Vorsicht"-Modus hat höhere Metadaten-Sichtbarkeit und
 *     einen schwächeren Briefkasten.
 *   • Das gesprochene Losungswort ist WISSEN, kein biometrisches Schloss;
 *     seine Entropie ist begrenzt — PBKDF2-600k bremst Brute-Force, ersetzt
 *     aber kein starkes Passwort. Für den Ernstfall: erprobte Werkzeuge
 *     (Signal mit Zensur-Umgehung, Tor-Bridges/Snowflake).
 *
 * DOM-frei + fail-soft. Persistenz über einen injizierten `store`-Adapter
 * (die Hülle reicht einen localStorage-Adapter mit UNAUFFÄLLIGEM, app-
 * gesuffixtem Schlüssel — versteckte Daten als normale App-Inhalte, KEINE
 * beschrifteten Krypto-Etiketten).
 */
import { newIdentity, dmEncrypt, dmDecrypt, safetyNumber, DM_PREFIX, sharedX } from "./vendor/dm_crypto.js";
import "./vendor/jasonlib.js";            // → globalThis.JasonLib
import "./vendor/20_schluessel_safe.js";  // → globalThis.SbkimSafe (Shamir 2/3)
import "./vendor/21_spracheingabe.js";    // → globalThis.SbkimSpeech
import { makeTransport, relayOrder, timeBucket, RELAYS, RELAY_WINDOW_MS } from "./relay-transport.js";

var G = (typeof globalThis !== "undefined") ? globalThis : window;

// Rotations-Fenster der Ablage-Adresse ("heutige Adresse", Plan §Frage 4).
// Getrennt von der Relais-Rotation (relay-transport RELAY_WINDOW_MS).
var MSG_WINDOW_MS = 24 * 60 * 60 * 1000;   // täglich
var INBOX_LOOKBACK = 2;                     // heutige + N vorige Adress-Fenster

// ---------- kleine Helfer ----------
function enc() { return new TextEncoder(); }
function toHex(bytes) {
  var s = "";
  for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}
function getSubtle() {
  var c = G.crypto;
  return (c && c.subtle) ? c.subtle : null;
}
async function sha256Hex(str) {
  var subtle = getSubtle();
  if (!subtle) throw new Error("WebCrypto (crypto.subtle) fehlt.");
  var buf = await subtle.digest("SHA-256", enc().encode(str));
  return toHex(new Uint8Array(buf));
}

// Losungswort → deterministischer, längen-fester KDF-Eingang. Reine
// Vor-Hashung (SHA-256), damit JEDE Wortlänge JasonLibs ≥8-Regel erfüllt,
// ohne die Entropie zu verändern (PBKDF2 leistet weiter die Streckung).
function normalizePhrase(text) {
  return String(text == null ? "" : text)
    .toLowerCase().trim().replace(/\s+/g, " ");
}
async function phraseToPassword(text) {
  return "cc1:" + (await sha256Hex("cc-phrase-v1|" + normalizePhrase(text)));
}

// Envelope-Strippen: JasonLibs encryptTresor-Blob trägt Klartext-Etiketten
// (kind:"jason-tresor", version, algorithm-Namen). Für die EXISTENZ-
// unsichtbare Ablage speichern wir nur die drei rohen Felder unter neutralen
// Kürzeln → sieht aus wie ein beliebiger App-Cache-Eintrag, kein Krypto-Label.
function stripEnvelope(blob) {
  return { s: blob.kdf.salt, i: blob.cipher.iv, c: blob.ciphertext };
}
function restoreEnvelope(opaque) {
  return {
    schemaVersion: 1, kind: "jason-tresor", version: 2,
    kdf: { algorithm: "PBKDF2", hash: "SHA-256", iterations: 600000, salt: opaque.s },
    cipher: { algorithm: "AES-GCM-256", iv: opaque.i },
    ciphertext: opaque.c,
  };
}
async function sealObject(obj, password) {
  var blob = await G.JasonLib.encryptTresor(obj, password);
  return stripEnvelope(blob);
}
async function openObject(opaque, password) {
  if (!opaque || !opaque.s || !opaque.i || !opaque.c) return null;
  try { return await G.JasonLib.decryptTresor(restoreEnvelope(opaque), password); }
  catch (e) { return null; }   // falsches Passwort / Manipulation → fail-soft
}

// ---------- Modul-Zustand ----------
var _store = null;             // { get(key), set(key,val), del(key) }
var _storeKey = "cc_state";    // unauffälliger, app-gesuffixter Schlüssel (Hülle setzt Suffix)
var _seed = "comm-core";       // Startwert für Relais- + Adress-Rotation (Hülle setzt ihn)
var _euPolicy = "frei";        // Modul 21 EU-Politik
var _mode = "normal";          // "normal" | "vorsicht"
var _now = function () { return (Date && Date.now) ? Date.now() : 0; };
var _makeTransport = makeTransport;   // injizierbar für Tests (Mock-Relais)

var _password = null;          // Vault-Passwort im RAM (nach unlock/enroll)
var _vault = null;             // { v, id:{priv,pub}, contacts:[{pub,name,ts}] } im RAM

function makeError(name, message) { var e = new Error(message); e.name = name; return e; }
function ensureStore() { if (!_store) throw makeError("NoStoreError", "comm-core: init(store) fehlt."); }
// Nutzbar (senden/lesen/paaren) = Identität im RAM. Das lokale Losungswort
// (_password) braucht nur, wer PERSISTIEREN will (enroll/addContact).
function ensureUnlocked() { if (!_vault || !_vault.id) throw makeError("LockedError", "comm-core ist gesperrt."); }

async function persistVault() {
  ensureStore(); ensureUnlocked();
  if (!_password) throw makeError("NotSealedError", "Nicht lokal versiegelt — erst ein Losungswort für diese Hülle setzen.");
  var opaque = await sealObject(_vault, _password);
  await _store.set(_storeKey, opaque);
}

// ---------- init ----------
async function init(opts) {
  opts = opts || {};
  if (opts.store && typeof opts.store.get === "function") _store = opts.store;
  if (typeof opts.storeKey === "string") _storeKey = opts.storeKey;
  if (opts.seed != null) _seed = String(opts.seed);
  if (typeof opts.euPolicy === "string") { _euPolicy = opts.euPolicy; try { G.SbkimSpeech.init({ euPolicy: _euPolicy }); } catch (e) {} }
  if (opts.mode === "normal" || opts.mode === "vorsicht") _mode = opts.mode;
  if (typeof opts.now === "function") _now = opts.now;
  if (typeof opts.makeTransport === "function") _makeTransport = opts.makeTransport;
  return CommCore._meta;
}

// ---------- identity ----------
function idCreate() {
  var id = newIdentity();                 // {priv, pub}  (dm_crypto)
  _vault = _vault || { v: 1, id: null, contacts: [] };
  _vault.id = id;
  return { pub: id.pub };
}
function idPubKey() { return (_vault && _vault.id) ? _vault.id.pub : null; }

// Tragbares, verschlüsseltes Identitäts-Päckchen (App-Hopping, Plan §App-
// Interoperabilität). Enthält Identität + Kontakte, verschlüsselt unter `pw`.
async function exportPacket(pw) {
  ensureUnlocked();
  if (typeof pw !== "string" || pw.length < 8) throw makeError("WeakPasswordError", "Päckchen-Passwort mind. 8 Zeichen.");
  var opaque = await sealObject({ v: 1, id: _vault.id, contacts: _vault.contacts }, pw);
  return "ccpkt1." + G.btoa(JSON.stringify(opaque));
}
// Lädt Identität + Kontakte aus dem Päckchen in den RAM (sofort nutzbar). Wird
// `localPhrase` mitgegeben, wird das Ergebnis zusätzlich lokal versiegelt +
// persistiert (App-Hopping dauerhaft in dieser Hülle); sonst nur für die
// Sitzung. `pw` = Päckchen-Passwort (getrennt vom lokalen Losungswort).
async function importPacket(packet, pw, localPhrase) {
  if (typeof packet !== "string" || packet.indexOf("ccpkt1.") !== 0) return false;
  var opaque;
  try { opaque = JSON.parse(G.atob(packet.slice("ccpkt1.".length))); } catch (e) { return false; }
  var obj = await openObject(opaque, pw);
  if (!obj || !obj.id || !obj.id.priv) return false;
  _vault = { v: 1, id: obj.id, contacts: Array.isArray(obj.contacts) ? obj.contacts : [] };
  if (typeof localPhrase === "string" && localPhrase.length) {
    _password = await phraseToPassword(localPhrase);
    await persistVault();
  }
  return true;
}

// ---------- enroll / unlock (gesprochenes Losungswort) ----------
// Ersteinrichtung: kein Vault vorhanden → Identität erzeugen, Vault unter
// dem Losungswort versiegeln, persistieren. Existenz-unsichtbar: ohne das
// richtige Wort ist der Store-Eintrag ein bedeutungsloser Chiffrat-Klumpen.
async function enrollFromSpokenPhrase(text) {
  ensureStore();
  var existing = await _store.get(_storeKey);
  if (existing) return { ok: false, created: false, reason: "Es existiert bereits ein versteckter Bereich — bitte entsperren." };
  _password = await phraseToPassword(text);
  if (!_vault || !_vault.id) idCreate();
  await persistVault();
  return { ok: true, created: true, pub: idPubKey() };
}
// Entsperren: vorhandenen versteckten Bereich mit dem Losungswort öffnen.
async function unlockFromSpokenPhrase(text) {
  ensureStore();
  var opaque = await _store.get(_storeKey);
  if (!opaque) return false;
  var pw = await phraseToPassword(text);
  var obj = await openObject(opaque, pw);
  if (!obj || !obj.id) return false;
  _password = pw;
  _vault = { v: 1, id: obj.id, contacts: Array.isArray(obj.contacts) ? obj.contacts : [] };
  return true;
}
function lock() { _password = null; _vault = null; }
function isUnlocked() { return !!(_vault && _password); }

// ---------- pairing (TOFU + Sicherheitsnummer) ----------
async function addContact(pubHex, name) {
  ensureUnlocked();
  var pub = String(pubHex || "").toLowerCase().trim();
  if (!/^[0-9a-f]{64}$/.test(pub)) return { ok: false, reason: "Kein gültiger Kontakt-Schlüssel (64 hex)." };
  if (pub === _vault.id.pub) return { ok: false, reason: "Das ist dein eigener Schlüssel." };
  var found = _vault.contacts.find(function (c) { return c.pub === pub; });
  if (found) { found.name = String(name || found.name || ""); }
  else { _vault.contacts.push({ pub: pub, name: String(name || ""), ts: _now() }); }
  await persistVault();
  return { ok: true, pub: pub };
}
function listContacts() { ensureUnlocked(); return _vault.contacts.map(function (c) { return { pub: c.pub, name: c.name, ts: c.ts }; }); }
async function removeContact(pubHex) {
  ensureUnlocked();
  var pub = String(pubHex || "").toLowerCase();
  var before = _vault.contacts.length;
  _vault.contacts = _vault.contacts.filter(function (c) { return c.pub !== pub; });
  if (_vault.contacts.length !== before) { await persistVault(); return true; }
  return false;
}
// Sicherheitsnummer (SAS/TOFU) — symmetrisch aus beiden Pubkeys (dm_crypto).
// Plan: getarnt als "lies mir die Zahlen vor".
async function safetyNumberFor(peerPubHex) {
  ensureUnlocked();
  return await safetyNumber(_vault.id.pub, String(peerPubHex || "").toLowerCase());
}

// ---------- circle / recovery (JT3v5 + Safe-Modul-20 Shamir 2/3) ----------
// Wort-Anteile des Vertrauens-Kreises: JT3v5 3-von-5 (JasonLib).
async function splitPhrase(text) { return await G.JasonLib.splitSecret(normalizePhrase(text)); }
async function combinePhrase(shares) { try { return await G.JasonLib.combineShares(shares); } catch (e) { return null; } }
// Persönliche Passwort-Wiederherstellung: Shamir 2-von-3 (Safe Modul 20).
function splitPersonal(text) {
  var bytes = enc().encode(normalizePhrase(text));
  var objs = G.SbkimSafe._shamirSplitBytes(bytes, 3, 2);
  return objs.map(G.SbkimSafe._encodeShare);
}
function recoverPersonal(shares) { return G.SbkimSafe.recoverPassword(shares); }

// ---------- Ablage-Adresse (aus Paarung, nicht Identität; rotierend) ----------
// Aus dem gemeinsamen ECDH-Geheimnis (nur die zwei kennen es) + Tages-Fenster.
// Verrät nichts über die Identität; beide Seiten rechnen dieselbe Adresse.
async function pairTag(peerPubHex, bucket) {
  ensureUnlocked();
  var sx = sharedX(_vault.id.priv, String(peerPubHex).toLowerCase()); // symmetrisch
  var h = await sha256Hex("cc-ablage-v1|" + toHex(sx) + "|" + bucket);
  return "cc" + h.slice(0, 24);   // kurzer, namenloser Raum-Tag
}
function msgBucket(nowMs) { return Math.floor(nowMs / MSG_WINDOW_MS); }

// ---------- Transport-Instanz (lazy, mode-abhängig) ----------
var _tx = null;
function transport() {
  if (_tx) return _tx;
  // Stufe A: sowohl "normal" als auch "vorsicht" nutzen den eingebackenen
  // öffentlichen Relais-Pool (eigener Server = Stufe B). Der Modus-Schalter
  // ist verdrahtet + dokumentiert; Stufe B hängt hier den eigenen Server ein.
  _tx = _makeTransport({ seed: _seed, now: _now });
  return _tx;
}

// ---------- msg (async E2E, Store-and-Forward) ----------
// Sendet {text|voice|image} an einen Kontakt. dm_crypto verschlüsselt E2E;
// das DM_PREFIX-Etikett wird VOR dem Versand gestrippt (namenloser Klumpen)
// und beim Empfang wieder angesetzt — dm_crypto bleibt byte-unverändert.
async function send(peerPubHex, message) {
  ensureUnlocked();
  var peer = String(peerPubHex || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(peer)) return { ok: false, reason: "Kein gültiger Empfänger-Schlüssel." };
  message = message || {};
  var kind = message.voice ? "voice" : (message.image ? "image" : "text");
  var body = message.voice || message.image || message.text || "";
  if (!body) return { ok: false, reason: "Leere Nachricht." };
  var payload = JSON.stringify({ t: kind, b: body, from: _vault.id.pub, ts: _now() });
  var ctFull = await dmEncrypt(payload, _vault.id.priv, peer);          // "sbkimdm1:iv:ct"
  var ctBare = ctFull.slice(DM_PREFIX.length);                          // Etikett strippen
  var tag = await pairTag(peer, msgBucket(_now()));
  var ev = await transport().publish({
    kind: 1,
    created_at: Math.floor(_now() / 1000),
    tags: [["t", tag]],
    content: ctBare,
  });
  return { ok: true, id: ev.id, tag: tag };
}

// Holt Nachrichten eines Kontakts aus dem Briefkasten (Relais-Event-Store).
// Fragt die heutige + INBOX_LOOKBACK vorige Adress-Fenster ab (Uhr-Versatz +
// Offline-Zeit). Liefert entschlüsselte Nachrichten inkl. Richtung.
async function inbox(peerPubHex, opts) {
  ensureUnlocked();
  opts = opts || {};
  var peer = String(peerPubHex || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(peer)) return [];
  var lookback = typeof opts.lookback === "number" ? opts.lookback : INBOX_LOOKBACK;
  var waitMs = typeof opts.waitMs === "number" ? opts.waitMs : 4000;
  var nowB = msgBucket(_now());
  var tags = [];
  for (var b = nowB; b >= nowB - lookback; b--) tags.push(await pairTag(peer, b));
  var sinceSec = Math.floor((_now() - (lookback + 1) * MSG_WINDOW_MS) / 1000);
  var tx = transport();
  var out = [];
  var seen = {};
  return await new Promise(function (resolve) {
    var unsub = tx.subscribe({ kinds: [1], "#t": tags, since: sinceSec }, function (ev) {
      if (!ev || typeof ev.content !== "string" || seen[ev.id]) return;
      seen[ev.id] = true;
      dmDecrypt(DM_PREFIX + ev.content, _vault.id.priv, peer).then(function (pt) {
        if (pt == null) return;                       // nicht für dieses Paar / fremd
        try {
          var m = JSON.parse(pt);
          out.push({
            id: ev.id, from: m.from, kind: m.t, body: m.b, ts: m.ts,
            direction: (m.from === _vault.id.pub) ? "out" : "in",
            created_at: ev.created_at,
          });
        } catch (e) { /* kein comm-core-Payload */ }
      });
    });
    setTimeout(function () {
      try { unsub(); } catch (e) {}
      out.sort(function (a, b2) { return (a.ts || 0) - (b2.ts || 0); });
      resolve(out);
    }, waitMs);
  });
}

// ---------- relay (berechnete Rotation) ----------
function currentByTimeSeed() { return relayOrder(_seed, timeBucket(_now(), RELAY_WINDOW_MS)); }
function relayTryNextOnFail() { return transport().tryNextOnFail(); }

// ---------- mode ----------
function getMode() { return _mode; }
function setMode(m) { if (m === "normal" || m === "vorsicht") { _mode = m; _tx = null; } return _mode; }

// ---------- call (WebRTC-Gerüst, SCHLAFEND — Stufe B) ----------
// Anruf-Gerüst angelegt aber nicht aktiv (Plan: "Anruf-Gerüst anlegen, aber
// schlafend"; Sprache zuerst, Video Extra — Stufe B). Kein WebRTC-Aufbau hier.
var call = {
  isActive: function () { return false; },
  start: function () { return { available: false, reason: "Anruf schläft — wird in Stufe B aktiviert (Sprache zuerst, dann Video)." }; },
  _sleeping: true,
};

// ---------- öffentliche Fläche ----------
var CommCore = {
  init: init,
  isUnlocked: isUnlocked,
  identity: { create: idCreate, pubKey: idPubKey, exportPacket: exportPacket, importPacket: importPacket },
  enroll: { fromSpokenPhrase: enrollFromSpokenPhrase },
  unlock: { fromSpokenPhrase: unlockFromSpokenPhrase, lock: lock },
  pairing: { addContact: addContact, listContacts: listContacts, removeContact: removeContact, safetyNumber: safetyNumberFor },
  circle: { splitPhrase: splitPhrase, combinePhrase: combinePhrase, splitPersonal: splitPersonal, recoverPersonal: recoverPersonal },
  msg: { send: send, inbox: inbox },
  relay: { currentByTimeSeed: currentByTimeSeed, tryNextOnFail: relayTryNextOnFail },
  mode: { get: getMode, set: setMode },
  call: call,
  // Sprach-Auslöser reicht comm-core NICHT selbst durch — die Hülle nutzt
  // window.SbkimSpeech (Modul 21) und gibt den erkannten Text an
  // enroll/unlock.fromSpokenPhrase. Hier nur die Referenz + EU-Politik.
  speech: { module: function () { return G.SbkimSpeech || null; }, euPolicy: function () { return _euPolicy; } },
  _meta: {
    get mode() { return _mode; },
    get seed() { return _seed; },
    get relays() { return RELAYS.slice(); },
    get msgWindowMs() { return MSG_WINDOW_MS; },
    get relayWindowMs() { return RELAY_WINDOW_MS; },
    get unlocked() { return isUnlocked(); },
    version: "comm-core/stufe-a-1",
  },
};

G.CommCore = CommCore;
export default CommCore;
export { CommCore };

if (typeof console !== "undefined" && console.info) {
  console.info("comm-core (Stufe A) bereit — identity/enroll/unlock/pairing/circle/msg/relay/mode/call (Anruf schläft).");
}
