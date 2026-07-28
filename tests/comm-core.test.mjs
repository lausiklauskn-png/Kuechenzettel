/*
 * comm-core — Headless-Beweis (Stufe A).
 * Prüft die MECHANIK des Kerns gegen ein In-Memory-Mock-Relais (der echte
 * Transport-Code läuft, nur die WebSocket ist gemockt — store-and-forward).
 * NICHT geprüft (ehrlich): echte öffentliche Relais (wss blockiert in der
 * Sandbox), Browser-UI, Live-Mikrofon, Schutz gegen gezielte Überwachung
 * (dafür bleiben Signal / Tor die stärkeren Werkzeuge).
 *
 * Lauf: node tests/comm-core.test.mjs
 */
import "./_shim.mjs"; // MUSS zuerst laden: setzt self für noble (crypto.web), nur headless
import { makeTransport } from "../comm-core/relay-transport.js";

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(t) { console.log("\n— " + t); }

// ---------- In-Memory-Mock-Relais (store-and-forward, pro URL) ----------
function makeRelayHub() {
  const store = {};       // url -> [events]
  const sockets = {};     // url -> [socket]
  const clock = { t: 1_700_000_000_000 };
  function matches(filter, ev) {
    if (filter.kinds && filter.kinds.indexOf(ev.kind) === -1) return false;
    if (filter["#t"]) { const evt = ev.tags.filter(x => x[0] === "t").map(x => x[1]); if (!filter["#t"].some(t => evt.indexOf(t) !== -1)) return false; }
    if (typeof filter.since === "number" && ev.created_at < filter.since) return false;
    return true;
  }
  function mockSocket(url) {
    const s = { url, readyState: 0, subs: {}, onopen: null, onmessage: null, onclose: null, onerror: null };
    (sockets[url] = sockets[url] || []).push(s);
    store[url] = store[url] || [];
    s.send = function (data) {
      const m = JSON.parse(data);
      if (m[0] === "EVENT") {
        const ev = m[1];
        store[url].push(ev);
        // an alle offenen Sockets dieser URL mit passender Sub zustellen
        (sockets[url] || []).forEach(sk => {
          if (sk.readyState !== 1) return;
          Object.keys(sk.subs).forEach(id => { if (matches(sk.subs[id], ev)) deliver(sk, id, ev); });
        });
      } else if (m[0] === "REQ") {
        const id = m[1], filter = m[2];
        s.subs[id] = filter;
        store[url].forEach(ev => { if (matches(filter, ev)) deliver(s, id, ev); });
      } else if (m[0] === "CLOSE") { delete s.subs[m[1]]; }
    };
    s.close = function () { s.readyState = 3; if (s.onclose) s.onclose(); };
    setTimeout(() => { s.readyState = 1; if (s.onopen) s.onopen(); }, 0);
    return s;
  }
  function deliver(sk, id, ev) { setTimeout(() => { if (sk.onmessage) sk.onmessage({ data: JSON.stringify(["EVENT", id, ev]) }); }, 0); }
  return { mockSocket, clock, store };
}

// In-Memory-Store-Adapter (steht für den localStorage-Adapter der Hülle).
function makeStore() {
  const m = new Map();
  return { _m: m, get: async k => (m.has(k) ? m.get(k) : null), set: async (k, v) => { m.set(k, v); }, del: async k => { m.delete(k); } };
}

// Frische comm-core-Instanz (eigener Modul-Zustand via Query-String-Import).
async function freshCore(tag) {
  const mod = await import("../comm-core/comm-core.js?party=" + tag);
  return mod.default;
}

async function run() {
  const hub = makeRelayHub();
  const now = () => hub.clock.t;
  const txFactory = (o) => makeTransport({ ...o, makeSocket: hub.mockSocket, now });

  // ---------------- 1. Entsperren (Passwort, auch gesprochen) ----------------
  section("1. Passwort-Entsperren + verschlüsselte Ablage am Gerät");
  const A = await freshCore("A");
  const storeA = makeStore();
  await A.init({ store: storeA, storeKey: "kf_state_v1", seed: "sim-seed", now, makeTransport: txFactory });
  ok(!A.isUnlocked(), "A startet gesperrt");
  const en = await A.enroll.fromSpokenPhrase("wie macht man omas gulasch");
  ok(en.ok && en.created && /^[0-9a-f]{64}$/.test(en.pub), "enroll erzeugt Identität + versiegelt Vault");
  ok(A.isUnlocked(), "A ist nach enroll entsperrt");
  // Store-Eintrag ist ein namenloser Chiffrat-Klumpen — KEIN Krypto-Etikett.
  const raw = JSON.stringify(storeA._m.get("kf_state_v1"));
  ok(!/jason-tresor|sbkim|PBKDF2|AES|tresor|priv|pub/i.test(raw), "verschlüsselte Ablage trägt keine Klartext-Krypto-/Identitäts-Etiketten");
  ok(Object.keys(JSON.parse(raw)).sort().join("") === "cis", "Ablage hat nur neutrale Felder {s,i,c}");

  // Sperren + falsches Wort scheitert, richtiges Wort öffnet.
  A.unlock.lock();
  ok(!A.isUnlocked(), "lock() sperrt");
  ok((await A.unlock.fromSpokenPhrase("falsches wort")) === false, "falsches Passwort öffnet NICHT");
  ok((await A.unlock.fromSpokenPhrase("Wie macht man Omas Gulasch")) === true, "richtiges Wort öffnet (normalisiert, groß/klein egal)");

  // ---------------- 2. Paaren + Sicherheitsnummer (TOFU) ----------------
  section("2. Paaren + Sicherheitsnummer (TOFU)");
  const B = await freshCore("B");
  const storeB = makeStore();
  await B.init({ store: storeB, storeKey: "kz_state_v1", seed: "sim-seed", now, makeTransport: txFactory });
  await B.enroll.fromSpokenPhrase("das rezept vom sonntag");
  const pubA = A.identity.pubKey(), pubB = B.identity.pubKey();
  await A.pairing.addContact(pubB, "Freund");
  await B.pairing.addContact(pubA, "Mutter");
  ok(A.pairing.listContacts().length === 1 && A.pairing.listContacts()[0].pub === pubB, "A hat B als Kontakt");
  const sasA = await A.pairing.safetyNumber(pubB), sasB = await B.pairing.safetyNumber(pubA);
  ok(sasA === sasB && sasA.length > 10, "Sicherheitsnummer beidseits gleich (SAS): " + sasA.slice(0, 11) + "…");

  // ---------------- 3. Verschlüsselte async-Nachricht A→B ----------------
  section("3. Verschlüsselte async-Nachricht A→B (Text + Sprachnotiz)");
  const s1 = await A.msg.send(pubB, { text: "Hallo, alles ok bei dir?" });
  const s2 = await A.msg.send(pubB, { voice: "BASE64AUDIODATA==" });
  ok(s1.ok && s2.ok, "A sendet Text + Sprachnotiz");
  // Der Wire-Klumpen ist namenlos: kein DM_PREFIX, keine Krypto-Etiketten.
  const wire = JSON.stringify(hub.store[Object.keys(hub.store)[0]]);
  ok(!/sbkimdm1|jason|tresor|Hallo|alles ok/.test(wire), "Wire-Payload ist namenloser Chiffrat-Klumpen (kein Etikett, kein Klartext)");
  const inbox = await B.msg.inbox(pubA, { waitMs: 60 });
  ok(inbox.length === 2, "B empfängt 2 Nachrichten (Store-and-Forward), erhielt " + inbox.length);
  ok(inbox.some(m => m.kind === "text" && m.body === "Hallo, alles ok bei dir?" && m.direction === "in"), "Text korrekt entschlüsselt (Richtung in)");
  ok(inbox.some(m => m.kind === "voice" && m.body === "BASE64AUDIODATA=="), "Sprachnotiz korrekt entschlüsselt");

  // Dritter (fremde Schlüssel) kann NICHT mitlesen.
  const C = await freshCore("C");
  await C.init({ store: makeStore(), storeKey: "x", seed: "sim-seed", now, makeTransport: txFactory });
  await C.enroll.fromSpokenPhrase("irgendein anderes wort");
  const eaves = await C.msg.inbox(pubA, { waitMs: 60 });
  ok(eaves.length === 0, "Fremder ohne Paar-Schlüssel liest NICHTS mit (E2E), sah " + eaves.length);

  // ---------------- 4. App-Hopping (tragbares Päckchen) ----------------
  section("4. App-Hopping — dieselbe Identität in beiden Hüllen");
  const pkt = await A.identity.exportPacket("paket-passwort-123");
  const A2 = await freshCore("A2");                 // steht für die zweite Hülle (kuechenzettel)
  await A2.init({ store: makeStore(), storeKey: "kz_state_v1", seed: "sim-seed", now, makeTransport: txFactory });
  ok((await A2.identity.importPacket(pkt, "falsch")) === false, "Päckchen mit falschem Passwort → abgelehnt");
  ok((await A2.identity.importPacket(pkt, "paket-passwort-123")) === true, "Päckchen mit richtigem Passwort importiert");
  ok(A2.identity.pubKey() === pubA && A2.pairing.listContacts()[0].pub === pubB, "zweite Hülle hat dieselbe Identität + Kontakte");
  // Beweis: A2 kann als A weiter mit B reden (B empfängt A2-Nachricht).
  await A2.msg.send(pubB, { text: "jetzt aus der anderen App" });
  const inbox2 = await B.msg.inbox(pubA, { waitMs: 60 });
  ok(inbox2.some(m => m.body === "jetzt aus der anderen App"), "Nachricht aus der zweiten Hülle kommt bei B an");

  // ---------------- 5. Berechnet-wechselndes Relais ----------------
  section("5. Berechnet-wechselndes Relais (eingebackene Liste + Reihenfolge)");
  const ordA = A.relay.currentByTimeSeed(), ordB = B.relay.currentByTimeSeed();
  ok(JSON.stringify(ordA) === JSON.stringify(ordB), "A und B (gleicher Seed+Zeit) berechnen dieselbe Relais-Reihenfolge");
  ok(ordA.length === A._meta.relays.length && ordA.every(u => u.startsWith("wss://")), "Reihenfolge deckt den ganzen eingebackenen Pool ab");
  ok(!ordA.some(u => /family-projekt/.test(u)), "KEIN relay.family-projekt.de im Pool");
  // anderes Zeitfenster → andere Reihenfolge (Rotation)
  hub.clock.t += A._meta.relayWindowMs;
  const ordLater = A.relay.currentByTimeSeed();
  ok(JSON.stringify(ordLater) !== JSON.stringify(ordA), "nächstes Zeitfenster → neue Reihenfolge (Rotation)");
  hub.clock.t -= A._meta.relayWindowMs;

  // ---------------- 6. Kreis-/Wiederherstellungs-Anteile ----------------
  section("6. Wort-Anteile (JT3v5 3/5) + persönliche Wiederherstellung (Shamir 2/3)");
  const jt = await A.circle.splitPhrase("wie macht man omas gulasch");
  ok(jt.shares.length === 5, "JT3v5 erzeugt 5 Anteile");
  const back = await A.circle.combinePhrase([jt.shares[1], jt.shares[3], jt.shares[4]]);
  ok(back === "wie macht man omas gulasch", "3 von 5 Anteilen stellen das Wort wieder her");
  ok((await A.circle.combinePhrase([jt.shares[0]])) === null, "1 Anteil ist wertlos (fail-soft null)");
  const pers = A.circle.splitPersonal("mein persoenliches wort");
  ok(pers.length === 3, "Safe-Modul-20 Shamir erzeugt 3 Anteile");
  ok(A.circle.recoverPersonal([pers[0], pers[2]]) === "mein persoenliches wort", "2 von 3 stellen persönliches Wort wieder her");
  ok(A.circle.recoverPersonal([pers[0]]) === null, "1 von 3 reicht nicht (null)");

  // ---------------- 7. Modus + schlafender Anruf ----------------
  section("7. Modus-Schalter + schlafendes Anruf-Gerüst");
  ok(A.mode.get() === "normal", "Default-Modus normal");
  ok(A.mode.set("vorsicht") === "vorsicht", "Vorsicht-Modus schaltbar");
  ok(A.call.isActive() === false && A.call.start().available === false, "Anruf-Gerüst liegt an, schläft (Stufe B)");

  console.log("\n════════════════════════════════");
  console.log(`comm-core: ${pass} grün, ${fail} rot`);
  console.log("════════════════════════════════");
  if (fail) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
