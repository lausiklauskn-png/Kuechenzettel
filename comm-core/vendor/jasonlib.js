(function (root) {
  "use strict";
  var SCHEMA = 1;

  function genId() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) {}
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function nowIso() { return new Date().toISOString(); }

  function validateAndParse(text) {
    if (typeof text !== "string" || text.trim() === "") return { ok: false, error: "leer" };
    try { return { ok: true, value: JSON.parse(text) }; }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }

  function byteSize(value) {
    var s;
    try { s = JSON.stringify(value); } catch (e) { s = ""; }
    if (s == null) s = "";
    try { return new TextEncoder().encode(s).length; } catch (e2) { return s.length; }
  }

  function normalizeTags(tags) {
    if (typeof tags === "string") tags = tags.split(",");
    if (!Array.isArray(tags)) return [];
    var out = [];
    for (var i = 0; i < tags.length; i++) {
      var t = String(tags[i]).trim().toLowerCase();
      if (t && out.indexOf(t) === -1) out.push(t);
    }
    return out;
  }

  function makeEntry(input) {
    input = input || {};
    var name = String(input.name || "").trim() || "Unbenannte Jason";
    return {
      schemaVersion: SCHEMA,
      kind: "jason-eintrag",
      id: input.id || genId(),
      name: name,
      tags: normalizeTags(input.tags),
      category: String(input.category || "").trim(),
      origin: input.origin ? String(input.origin) : "",
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
      size: byteSize(input.payload),
      payload: input.payload
    };
  }

  function buildLibraryExport(entries) {
    return {
      schemaVersion: SCHEMA,
      kind: "jason-bibliothek",
      exportedAt: nowIso(),
      count: entries.length,
      eintraege: entries
    };
  }

  function asEntry(obj, fallbackName) {
    if (obj && obj.kind === "jason-eintrag" && Object.prototype.hasOwnProperty.call(obj, "payload")) {
      return makeEntry({
        id: obj.id, name: obj.name, tags: obj.tags, category: obj.category,
        origin: obj.origin, createdAt: obj.createdAt, payload: obj.payload
      });
    }
    return makeEntry({ name: fallbackName, payload: obj });
  }

  function parseLibraryImport(text, fallbackName) {
    var p = validateAndParse(text);
    if (!p.ok) return { ok: false, error: p.error, entries: [] };
    var v = p.value, entries = [], i;
    if (v && v.kind === "jason-bibliothek" && Array.isArray(v.eintraege)) {
      for (i = 0; i < v.eintraege.length; i++) entries.push(asEntry(v.eintraege[i]));
    } else if (v && v.kind === "jason-eintrag") {
      entries.push(asEntry(v));
    } else {
      entries.push(asEntry(v, fallbackName));
    }
    return { ok: true, entries: entries, error: "" };
  }

  function mergeEntries(existing, incoming) {
    var map = {}, order = [];
    function put(e) {
      if (!map[e.id]) order.push(e.id);
      else if (String(e.updatedAt) < String(map[e.id].updatedAt)) return;
      map[e.id] = e;
    }
    var i;
    for (i = 0; i < existing.length; i++) put(existing[i]);
    for (i = 0; i < incoming.length; i++) put(incoming[i]);
    return order.map(function (id) { return map[id]; });
  }

  function filterSort(entries, opts) {
    opts = opts || {};
    var q = String(opts.query || "").trim().toLowerCase();
    var cat = String(opts.category || "").trim().toLowerCase();
    var tag = String(opts.tag || "").trim().toLowerCase();
    var out = entries.filter(function (e) {
      if (cat && String(e.category).toLowerCase() !== cat) return false;
      if (tag && e.tags.indexOf(tag) === -1) return false;
      if (q) {
        var hay = (e.name + " " + e.category + " " + e.tags.join(" ")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var sort = opts.sort || "updated-desc";
    out.sort(function (a, b) {
      if (sort === "name-asc") return a.name.localeCompare(b.name);
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "created-asc") return String(a.createdAt).localeCompare(String(b.createdAt));
      if (sort === "created-desc") return String(b.createdAt).localeCompare(String(a.createdAt));
      if (sort === "updated-asc") return String(a.updatedAt).localeCompare(String(b.updatedAt));
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
    return out;
  }

  function allCategories(entries) {
    var s = [];
    entries.forEach(function (e) { if (e.category && s.indexOf(e.category) === -1) s.push(e.category); });
    return s.sort();
  }
  function allTags(entries) {
    var s = [];
    entries.forEach(function (e) { e.tags.forEach(function (t) { if (s.indexOf(t) === -1) s.push(t); }); });
    return s.sort();
  }

  // ---- Tresor (Scheibe 2): Passwort-Verschluesselung. GLEICHER Umschlag wie
  //      Modul 02 (sbkim-spore.js exportBackup) und sbkim/node_key.enc.json:
  //      PBKDF2-SHA256 600k -> AES-GCM-256. Browser UND Node (>=20) tauglich.
  var TRESOR_ITER = 600000;

  function cryptoObj() {
    var c = root.crypto || (typeof globalThis !== "undefined" ? globalThis.crypto : null);
    if (!c || !c.subtle) throw new Error("WebCrypto nicht verfuegbar (crypto.subtle fehlt).");
    return c;
  }
  function b64uFromBytes(bytes) {
    var bin = "", i;
    for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    var enc = root.btoa || (typeof globalThis !== "undefined" && globalThis.btoa) || null;
    var b64 = enc ? enc(bin) : Buffer.from(bytes).toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function bytesFromB64u(s) {
    var b64 = String(s).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var dec = root.atob || (typeof globalThis !== "undefined" && globalThis.atob) || null;
    var bin = dec ? dec(b64) : Buffer.from(b64, "base64").toString("binary");
    var out = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function deriveAesKey(password, salt, iterations, usages) {
    var c = cryptoObj();
    var mat = await c.subtle.importKey("raw", new TextEncoder().encode(String(password)),
      { name: "PBKDF2" }, false, ["deriveKey"]);
    return await c.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" },
      mat, { name: "AES-GCM", length: 256 }, false, usages);
  }
  async function encryptTresor(plainObj, password) {
    if (typeof password !== "string" || password.length < 8) throw new Error("Passwort zu kurz (mind. 8 Zeichen).");
    var c = cryptoObj();
    var salt = c.getRandomValues(new Uint8Array(16));
    var iv = c.getRandomValues(new Uint8Array(12));
    var key = await deriveAesKey(password, salt, TRESOR_ITER, ["encrypt"]);
    var pt = new TextEncoder().encode(JSON.stringify(plainObj));
    var ctBuf = await c.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, pt);
    return {
      schemaVersion: SCHEMA, kind: "jason-tresor", version: 2,
      kdf: { algorithm: "PBKDF2", hash: "SHA-256", iterations: TRESOR_ITER, salt: b64uFromBytes(salt) },
      cipher: { algorithm: "AES-GCM-256", iv: b64uFromBytes(iv) },
      ciphertext: b64uFromBytes(new Uint8Array(ctBuf))
    };
  }
  async function decryptTresor(blob, password) {
    var c = cryptoObj();
    var salt = bytesFromB64u(blob.kdf.salt);
    var iv = bytesFromB64u(blob.cipher.iv);
    var ct = bytesFromB64u(blob.ciphertext);
    var key = await deriveAesKey(password, salt, blob.kdf.iterations || TRESOR_ITER, ["decrypt"]);
    var plainBuf = await c.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct); // wirft bei falschem PW/Manipulation
    return JSON.parse(new TextDecoder().decode(plainBuf));
  }
  function isTresor(v) {
    return !!(v && v.kdf && v.cipher && typeof v.ciphertext === "string" &&
      v.kdf.algorithm === "PBKDF2" && /AES-GCM/.test(String(v.cipher.algorithm)));
  }
  // Buch-Tresor mit optionalem Tarnfach (Honigtopf): probiert zuerst den echten Umschlag,
  // dann — falls vorhanden — das Tarnfach (decoy). Liefert {mode:'real'|'decoy', plain}.
  // Echtes Passwort -> echte Daten; Koeder-Passwort -> harmlose Schein-Bibliothek.
  // Wirft bei falschem Passwort/Manipulation (AES-GCM-Auth-Tag).
  async function openVault(rec, password) {
    if (!rec || !rec.tresor) throw new Error("Kein Tresor.");
    try { return { mode: "real", plain: await decryptTresor(rec.tresor, password) }; }
    catch (e) { /* echtes Passwort passt nicht -> evtl. Koeder-Passwort */ }
    if (rec.decoy && isTresor(rec.decoy)) {
      return { mode: "decoy", plain: await decryptTresor(rec.decoy, password) };
    }
    throw new Error("Falsches Passwort oder Tresor beschädigt.");
  }
  function tresorPayloadKind(plainObj) {
    if (plainObj && plainObj.kind === "jason-bibliothek" && Array.isArray(plainObj.eintraege)) return "bibliothek";
    if (plainObj && Array.isArray(plainObj.identities)) return "identitaeten";
    return "roh";
  }
  function payloadToEntries(plainObj, fallbackName) {
    var kind = tresorPayloadKind(plainObj), entries = [];
    if (kind === "bibliothek") {
      plainObj.eintraege.forEach(function (e) { entries.push(asEntry(e)); });
    } else if (kind === "identitaeten") {
      entries.push(makeEntry({
        name: fallbackName || "SBKIM Schluessel-Backup",
        category: "SBKIM-Schluessel", tags: "schluessel, identitaet", payload: plainObj
      }));
    } else {
      entries.push(asEntry(plainObj, fallbackName));
    }
    return { kind: kind, entries: entries };
  }

  // ---- Shamir 3-von-5 (Geheimnis aufteilen): echte Mathematik ueber GF(256),
  //      dasselbe Galois-Feld wie AES (irreduzibles Polynom 0x11b). Ein Geheimnis
  //      (z. B. ein Buch-Passwort) wird in N=5 Teile zerlegt; BELIEBIGE K=3 stellen
  //      es exakt wieder her (Lagrange-Interpolation bei x=0), 1-2 Teile sind
  //      mathematisch wertlos. Jeder Teil traegt eine CRC32-Pruefziffer (erkennt
  //      Tippfehler genau am Teil) und alle Teile gemeinsam einen SHA-256-Finger-
  //      abdruck des Originals + eine zufaellige Split-ID (erkennt ein fremdes/
  //      manipuliertes Teil beim Zusammensetzen). Offline, ohne Abhaengigkeit;
  //      Zufall aus WebCrypto getRandomValues.
  var SHAMIR_K = 3, SHAMIR_N = 5, SHAMIR_VER = 1, SHAMIR_TAG = "JT3v5", SHAMIR_MAXLEN = 1024;

  // GF(256)-Tabellen (Generator 3, Polynom 0x11b). EXP doppelt lang -> kein Modulo.
  var GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
  (function buildGF() {
    var x = 1, i;
    for (i = 0; i < 255; i++) {
      GF_EXP[i] = x; GF_LOG[x] = i;
      var x2 = ((x << 1) & 0xff) ^ ((x & 0x80) ? 0x1b : 0); // x*2 (xtime)
      x = (x2 ^ x) & 0xff;                                   // x*3 = x*2 XOR x
    }
    for (i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();
  function gfMul(a, b) { if (a === 0 || b === 0) return 0; return GF_EXP[GF_LOG[a] + GF_LOG[b]]; }
  function gfDiv(a, b) { if (a === 0) return 0; return GF_EXP[GF_LOG[a] + 255 - GF_LOG[b]]; }

  // CRC32 (IEEE) als Pruefziffer je Teil (erkennt Verschreiber, nicht kryptografisch).
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes, len) {
    var c = 0xFFFFFFFF, i, L = (len == null ? bytes.length : len);
    for (i = 0; i < L; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Binaerformat je Teil: [ver,k,n,x, splitId(4), fp(4), shareY(L), crc32(4)] -> base64url.
  function shamirEncodeShare(ver, k, n, x, splitId, fp, shareY) {
    var L = shareY.length, head = 12, buf = new Uint8Array(head + L + 4);
    buf[0] = ver; buf[1] = k; buf[2] = n; buf[3] = x;
    buf.set(splitId, 4); buf.set(fp, 8); buf.set(shareY, head);
    var crc = crc32(buf, head + L);
    buf[head + L] = (crc >>> 24) & 0xff; buf[head + L + 1] = (crc >>> 16) & 0xff;
    buf[head + L + 2] = (crc >>> 8) & 0xff; buf[head + L + 3] = crc & 0xff;
    return SHAMIR_TAG + "-" + x + "-" + b64uFromBytes(buf);
  }
  function shamirParseShare(text) {
    var m = /^JT3v5-(\d+)-([A-Za-z0-9_\-]+)$/.exec(String(text == null ? "" : text).trim());
    if (!m) return { ok: false, error: "Kein gueltiger Teil-Code (erwartet JT3v5-…)." };
    var idx = parseInt(m[1], 10), buf;
    try { buf = bytesFromB64u(m[2]); } catch (e) { return { ok: false, error: "Teil " + idx + " ist unleserlich." }; }
    if (buf.length < 12 + 1 + 4) return { ok: false, error: "Teil " + idx + " ist zu kurz/beschaedigt." };
    var L = buf.length - 12 - 4;
    var crcGiven = ((buf[12 + L] << 24) | (buf[12 + L + 1] << 16) | (buf[12 + L + 2] << 8) | buf[12 + L + 3]) >>> 0;
    if (crcGiven !== crc32(buf, 12 + L)) return { ok: false, error: "Teil " + idx + " ist verschrieben/beschaedigt (Pruefziffer passt nicht)." };
    if (buf[3] !== idx) return { ok: false, error: "Teil " + idx + " ist beschaedigt (Teil-Nummer passt nicht)." };
    return { ok: true, ver: buf[0], k: buf[1], n: buf[2], x: buf[3],
      splitId: buf.subarray(4, 8), fp: buf.subarray(8, 12), y: buf.subarray(12, 12 + L) };
  }

  // Geheimnis (String) -> { k, n, fingerprint, shares:[Text-Codes] }. Async wegen SHA-256.
  async function splitSecret(secret) {
    if (typeof secret !== "string" || secret.length === 0) throw new Error("Geheimnis (Passwort) fehlt.");
    var bytes = new TextEncoder().encode(secret);
    if (bytes.length > SHAMIR_MAXLEN) throw new Error("Geheimnis zu lang (max " + SHAMIR_MAXLEN + " Bytes).");
    var c = cryptoObj(), k = SHAMIR_K, n = SHAMIR_N, L = bytes.length;
    var fp = new Uint8Array(await c.subtle.digest("SHA-256", bytes)).subarray(0, 4);
    var splitId = c.getRandomValues(new Uint8Array(4));
    var xs = [], shares = [], s, pos, ci, si, d;
    for (s = 0; s < n; s++) { xs.push(s + 1); shares.push(new Uint8Array(L)); }
    for (pos = 0; pos < L; pos++) {
      var coeffs = new Uint8Array(k);
      coeffs[0] = bytes[pos];
      var rnd = c.getRandomValues(new Uint8Array(k - 1));
      for (ci = 1; ci < k; ci++) coeffs[ci] = rnd[ci - 1];
      while (coeffs[k - 1] === 0) coeffs[k - 1] = c.getRandomValues(new Uint8Array(1))[0]; // Grad genau k-1
      for (si = 0; si < n; si++) {
        var xv = xs[si], y = 0, p = 1;
        for (d = 0; d < k; d++) { y ^= gfMul(coeffs[d], p); p = gfMul(p, xv); }
        shares[si][pos] = y;
      }
    }
    var out = [];
    for (s = 0; s < n; s++) out.push(shamirEncodeShare(SHAMIR_VER, k, n, xs[s], splitId, fp, shares[s]));
    return { tag: SHAMIR_TAG, k: k, n: n, fingerprint: b64uFromBytes(fp), shares: out };
  }

  // Beliebige >=K Teil-Codes -> das urspruengliche Geheimnis (String). Async wegen SHA-256.
  async function combineShares(texts) {
    if (!Array.isArray(texts)) throw new Error("Liste von Teil-Codes erwartet.");
    var parsed = [], i, p;
    for (i = 0; i < texts.length; i++) {
      if (texts[i] == null || String(texts[i]).trim() === "") continue;
      p = shamirParseShare(texts[i]);
      if (!p.ok) throw new Error(p.error);
      parsed.push(p);
    }
    if (parsed.length === 0) throw new Error("Keine Teile angegeben.");
    var k = parsed[0].k, n = parsed[0].n, L0 = parsed[0].y.length;
    var id0 = b64uFromBytes(parsed[0].splitId), fp0 = b64uFromBytes(parsed[0].fp), seen = {};
    for (i = 0; i < parsed.length; i++) {
      if (parsed[i].k !== k || parsed[i].n !== n || parsed[i].y.length !== L0 ||
          b64uFromBytes(parsed[i].splitId) !== id0 || b64uFromBytes(parsed[i].fp) !== fp0)
        throw new Error("Diese Teile gehoeren nicht zum selben Geheimnis.");
      if (seen[parsed[i].x]) throw new Error("Teil " + parsed[i].x + " ist doppelt vorhanden.");
      seen[parsed[i].x] = true;
    }
    if (parsed.length < k) throw new Error("Zu wenige Teile: " + parsed.length + " von " + k + " noetig (1-2 Teile sind wertlos).");
    var use = parsed.slice(0, k), secret = new Uint8Array(L0), pos, a, b;
    for (pos = 0; pos < L0; pos++) {
      var val = 0;
      for (a = 0; a < k; a++) {
        var num = 1, den = 1;
        for (b = 0; b < k; b++) {
          if (b === a) continue;
          num = gfMul(num, use[b].x);             // prod_{b!=a} x_b
          den = gfMul(den, use[a].x ^ use[b].x);  // prod_{b!=a} (x_a - x_b)   (in GF: - == XOR)
        }
        val ^= gfMul(use[a].y[pos], gfDiv(num, den));
      }
      secret[pos] = val;
    }
    var c = cryptoObj();
    var fp = b64uFromBytes(new Uint8Array(await c.subtle.digest("SHA-256", secret)).subarray(0, 4));
    if (fp !== fp0) throw new Error("Wiederherstellung fehlgeschlagen: Teile passen rechnerisch nicht zum Original (manipuliert?).");
    return new TextDecoder().decode(secret);
  }

  var api = {
    SCHEMA: SCHEMA, genId: genId, nowIso: nowIso, validateAndParse: validateAndParse,
    byteSize: byteSize, normalizeTags: normalizeTags, makeEntry: makeEntry,
    buildLibraryExport: buildLibraryExport, parseLibraryImport: parseLibraryImport,
    mergeEntries: mergeEntries, filterSort: filterSort,
    allCategories: allCategories, allTags: allTags,
    encryptTresor: encryptTresor, decryptTresor: decryptTresor, isTresor: isTresor,
    openVault: openVault,
    tresorPayloadKind: tresorPayloadKind, payloadToEntries: payloadToEntries,
    splitSecret: splitSecret, combineShares: combineShares,
    shamirInfo: { k: SHAMIR_K, n: SHAMIR_N, tag: SHAMIR_TAG, maxLen: SHAMIR_MAXLEN },
    parseShare: shamirParseShare, _gfMul: gfMul, _gfDiv: gfDiv
  };
  root.JasonLib = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
