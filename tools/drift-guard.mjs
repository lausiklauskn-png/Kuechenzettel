/*
 * Drift-Guard — wacht per SHA-256 darüber, dass die byte-1:1 aus dem
 * SBKIM-/Privat-Brain-Baukasten kopierten Bausteine NICHT abgewandelt werden
 * (Plan: "byte-1:1 in beide Hüllen, Drift-Guard"; Leitplanke "Kopieren, nicht
 * klonen"). Reift ein Modul, wird die Quelle im Ursprungs-Repo gepflegt und
 * hier NEU kopiert + der erwartete Hash aktualisiert — nie am Ort abgewandelt.
 *
 * Lauf: node tools/drift-guard.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Erwartete Hashes der byte-1:1-Bausteine + ihre kanonische Herkunft.
// Herkunft ist dokumentarisch (die Quell-Repos liegen nicht im Pages-Deploy);
// der Guard prüft die KOPIE gegen den festgehaltenen Hash.
const EXPECTED = [
  // Der geteilte Kern (Klebstoff) — MUSS in beiden Hüllen byte-1:1 sein.
  { file: "comm-core/comm-core.js",                sha: "1b0781bf35b9c888ce33d6a50a7e0898cd1218478ad0b9bdf9098d7ad6c0a665", src: "geteilter Kern (Kochfreunde == Kuechenzettel)" },
  { file: "comm-core/relay-transport.js",          sha: "2bc716b2dd6a0f64e1159f75c70cdb98d3feb3d42b47d8d87f28f8790e2fd3d7", src: "geteilter Kern (Kochfreunde == Kuechenzettel)" },
  // Byte-1:1 aus dem Baukasten kopierte Bausteine.
  { file: "comm-core/vendor/noble-secp256k1.js",  sha: "8f3879ca422c4fdfe7ca0361688636fa7cc550a59bd94d512ed6ec79aa3d55d1", src: "Privat-Brain/modules/noble-secp256k1.js" },
  { file: "comm-core/vendor/dm_crypto.js",         sha: "e9c973f0459c5f03fa80b47d3cd4505ef6d4bd689e409569370a59db2586ba63", src: "Privat-Brain/modules/dm_crypto.js" },
  { file: "comm-core/vendor/jasonlib.js",          sha: "d9b260980bf34dc3682fd062f15e2fcb18b305350833cce88b4980ab0b3f64df", src: "Jasons-Tresor/jasons-bibliothek/index.html (JASONLIB-CORE-START..END)" },
  { file: "comm-core/vendor/21_spracheingabe.js",  sha: "6be3902c67c3ebfb24a845c59bad9147af903c467b7fb7535bc26cc7943b2a49", src: "Sage-Protokol/src/modules/21_spracheingabe.js" },
  { file: "comm-core/vendor/20_schluessel_safe.js", sha: "e7e25c9070e93f8267171d2b626109cfd90cb481c2781242f5f7dfc203f031f3", src: "Sage-Protokol/src/modules/20_schluessel_safe.js" },
];

let ok = 0, bad = 0;
for (const e of EXPECTED) {
  let got;
  try { got = createHash("sha256").update(readFileSync(join(ROOT, e.file))).digest("hex"); }
  catch (err) { console.error(`  ✗ ${e.file} — nicht lesbar (${err.code})`); bad++; continue; }
  if (got === e.sha) { ok++; }
  else { bad++; console.error(`  ✗ DRIFT: ${e.file}\n      erwartet ${e.sha}\n      ist      ${got}\n      Quelle:  ${e.src}`); }
}
console.log(`Drift-Guard: ${ok} byte-1:1, ${bad} abgewichen`);
if (bad) process.exit(1);
