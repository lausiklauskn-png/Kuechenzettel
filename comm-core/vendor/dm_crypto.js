/*
 * Pinnwand E2E — Direkt-Nachricht-Krypto (B7, „Weg A": ECDH auf den vorhandenen
 * Nostr-Schlüsseln + TOFU). Verschlüsselt eine Nutzlast für GENAU einen Empfänger,
 * indem aus dem eigenen privaten Nostr-Schlüssel + dem öffentlichen Schlüssel der
 * Gegenseite per ECDH (secp256k1) ein gemeinsames Geheimnis abgeleitet wird
 * (NIP-04/44-Muster) → HKDF-SHA256 → AES-GCM-256.
 *
 * EHRLICH: Das ist dieselbe Ende-zu-Ende-Verschlüsselung wie bei Signal/WhatsApp.
 * Der Unterschied: kein zentraler Server verteilt Schlüssel → das Vertrauen beim
 * ERSTEN Kontakt kommt aus „du kennst die Gegenseite" (TOFU) + optionaler
 * Sicherheitsnummer-Vergleich (safetyNumber) über einen zweiten Kanal.
 *
 * Reiner, DOM-freier Krypto-Kopf — testbar headless (node:crypto WebCrypto).
 */
import { getSharedSecret, schnorr, utils } from './noble-secp256k1.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
export const DM_PREFIX = 'sbkimdm1:';

function fromHex(h) {
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
  return a;
}
function toHex(b) { return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(''); }
function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
function unb64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

// Schlüssel-Normalisierer: die App reicht den privaten Schlüssel als Uint8Array
// (fromHex(privHex)) durch, der Headless-Test als Hex-Text — beides muss gehen.
// (Ohne diese Normalisierung stürzt fromHex auf einem Uint8Array ab: h.substr.)
function asPrivBytes(k) {
  if (k instanceof Uint8Array) return k;
  return fromHex(String(k));
}
function asPubHex(p) {
  if (p instanceof Uint8Array) return toHex(p);
  return String(p).toLowerCase();
}

// Nostr-Pubkeys sind x-only (32 Byte / 64 hex, BIP340). Für ECDH heben wir sie mit
// geradem Y auf einen vollen Punkt (02||X) — genau wie NIP-04.
function liftPub(pub) {
  const h = asPubHex(pub);
  if (h.length === 64) return '02' + h;
  return h; // bereits 02/03/04-präfix
}

// Gemeinsames ECDH-Geheimnis (X-Koordinate) aus eigenem Priv + fremdem Pub.
// Priv als Uint8Array ODER Hex-Text, Pub als x-only-Hex ODER Bytes.
export function sharedX(myPriv, theirPub) {
  const shared = getSharedSecret(asPrivBytes(myPriv), liftPub(theirPub), false); // 0x04||X||Y
  return shared.slice(1, 33); // X-Koordinate
}

export async function deriveDmKey(myPrivHex, theirPubHex) {
  const ikm = sharedX(myPrivHex, theirPubHex);
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('sbkim-pinnwand-dm-v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// Verschlüsselt `text` FÜR `recipientPubHex`. Format: sbkimdm1:<iv_b64>:<ct_b64>.
export async function dmEncrypt(text, myPrivHex, recipientPubHex) {
  const key = await deriveDmKey(myPrivHex, recipientPubHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return DM_PREFIX + b64(iv) + ':' + b64(ct);
}

// Entschlüsselt mit dem öffentlichen Schlüssel der GEGENSEITE. null bei Fremd-
// Nachricht (nicht für dich), falschem Schlüssel oder Manipulation (fail-soft,
// kein Leck). ECDH ist symmetrisch: Sender nutzt Empfänger-Pub, Empfänger nutzt
// Sender-Pub — beide erhalten denselben Schlüssel.
export async function dmDecrypt(payload, myPrivHex, otherPubHex) {
  if (typeof payload !== 'string' || !payload.startsWith(DM_PREFIX)) return null;
  try {
    const parts = payload.slice(DM_PREFIX.length).split(':');
    if (parts.length !== 2) return null;
    const key = await deriveDmKey(myPrivHex, otherPubHex);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[0]) }, key, unb64(parts[1]));
    return dec.decode(pt);
  } catch { return null; }
}

export function isDm(s) { return typeof s === 'string' && s.startsWith(DM_PREFIX); }

// Sicherheitsnummer (SAS): SYMMETRISCH aus beiden Pubkeys, kurze Ziffern-Gruppen
// zum Vergleich über einen zweiten Kanal (Anruf/persönlich). Gleich bei beiden
// Seiten; verschieden bei anderem Schlüssel → MITM sichtbar.
export async function safetyNumber(pubA, pubB) {
  const pair = [String(pubA).toLowerCase(), String(pubB).toLowerCase()].sort();
  const h = await crypto.subtle.digest('SHA-256', enc.encode('sbkim-sas-v1|' + pair[0] + '|' + pair[1]));
  const bytes = new Uint8Array(h);
  let digits = '';
  for (let i = 0; i < 15; i++) digits += (bytes[i] % 100).toString().padStart(2, '0');
  return digits.replace(/(\d{5})(?=\d)/g, '$1 ');
}

// Kleine Helfer für die Kontakt-/TOFU-Schicht (die UI hält die Liste in localStorage).
export function newIdentity() {
  const priv = toHex(utils.randomPrivateKey());
  const pub = toHex(schnorr.getPublicKey(fromHex(priv)));
  return { priv, pub };
}
export function pubFromPriv(privHex) { return toHex(schnorr.getPublicKey(fromHex(privHex))); }
