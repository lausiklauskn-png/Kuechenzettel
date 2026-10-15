/*
 * Gegenprobe zur Knoten-Probe — jede Zusicherung wird in einer WEGWERF-KOPIE
 * einzeln weggenommen; tests/knoten.test.mjs muss dann rot werden, und die
 * erste rote Zeile muss den Namen der Zusicherung tragen.
 * ⚠ Arbeitet nur in Kopien unter dem System-Temp — der echte Baum bleibt unberührt.
 * NUR_ANKER=1 → nur prüfen, ob jeder Anker genau einmal trifft.
 */
import { readFileSync, writeFileSync, mkdtempSync, cpSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAELLE = [
  { name: "Schublade fehlt im <head>", datei: "index.html",
    alt: '<script>window.SBKIM_DB_SUFFIX = "kuechenzettel";</script>\n', neu: "", rot: "K3" },
  { name: "05b fehlt als eigene Zeile", datei: "index.html",
    alt: '<script type="module" src="./modules/05b_nostr_relay.js?v=3"></script>\n', neu: "", rot: "K8" },
  { name: "Siegel fehlt in der Kette", datei: "assets/sbkim-init.js",
    alt: '    ["",       "modules/16_siegel.js" + V],\n', neu: "", rot: "K6" },
  { name: "ein Modul fehlt im Vorrat", datei: "sw.js",
    alt: '"./modules/23_rendezvous.js?v=3", ', neu: "", rot: "K11" },
  { name: "Cache nicht erhöht", datei: "sw.js",
    alt: 'const CACHE_VERSION = "kuechenzettel-v3";', neu: 'const CACHE_VERSION = "kuechenzettel-v2";', rot: "K13" },
  { name: "Identität beim Start erzwungen", datei: "assets/sbkim-init.js",
    alt: "      geraetenameFeldEinhaengen();\n", neu: "      geraetenameFeldEinhaengen(); window.SbkimRendezvous.ensureIdentity();\n", rot: "K16" },
  { name: "Modul 23 ohne S1", datei: "modules/23_rendezvous.js",
    alt: "var RDV_QUERY_UNSIGNED_MAX_PER_MIN = 2;", neu: "var RDV_QUERY_UNSIGNED_MAX_PER_MIN = 6;", rot: "K1" },
  { name: "Beschreibung trägt eine Mailadresse", datei: "assets/siegel-inhalt.js",
    alt: "FÜR WEN: für alle", neu: "FÜR WEN: info@beispiel.example für alle", rot: "K21" },
  { name: "Knoten baut beim Laden eine Verbindung auf", datei: "assets/sbkim-init.js",
    alt: "    try {\n      if (!window.SbkimStorage) return;", neu: "    try { new WebSocket(\"ws://127.0.0.1:9\"); } catch (_e) {}\n    try {\n      if (!window.SbkimStorage) return;", rot: "B8" },
  { name: "Lampen-Knopf erbt die 38-px-Breite der Kopfknöpfe", datei: "assets/sbkim.css",
    alt: ".hd .lampen{width:auto;", neu: ".hd .lampen{", rot: "B11" },
];
let gefangen = 0, durch = 0, falsch = 0, tot = 0;
for (const f of FAELLE) {
  const quelle = readFileSync(join(root, f.datei), "utf8");
  const n = quelle.split(f.alt).length - 1;
  if (n !== 1) { tot++; console.log("☠ TOTER ANKER (" + n + "×): " + f.name); continue; }
  if (process.env.NUR_ANKER) { console.log("· Anker lebt: " + f.name); continue; }
  const kopie = mkdtempSync(join(tmpdir(), "kz-gp-"));
  for (const d of ["index.html", "sw.js", "sicherheit.html", "manifest.webmanifest", "assets", "modules", "comm-core", "icons", "tests"])
    if (existsSync(join(root, d))) cpSync(join(root, d), join(kopie, d), { recursive: true });
  if (existsSync(join(root, "node_modules"))) symlinkSync(join(root, "node_modules"), join(kopie, "node_modules"));
  writeFileSync(join(kopie, f.datei), quelle.replace(f.alt, f.neu));
  const r = spawnSync(process.execPath, [join(kopie, "tests/knoten.test.mjs")], { encoding: "utf8", timeout: 240000 });
  rmSync(kopie, { recursive: true, force: true });
  const ersteRot = (r.stdout || "").split("\n").find((z) => z.includes("✗ ROT"));
  if (r.status === 0) { durch++; console.log("✗ DURCHGERUTSCHT: " + f.name); }
  else if (ersteRot && ersteRot.includes(" " + f.rot + " ")) { gefangen++; console.log("✓ gefangen: " + f.name + "  → " + ersteRot.trim().slice(0, 90)); }
  else { falsch++; console.log("? AUS FALSCHEM GRUND: " + f.name + "  → " + (ersteRot || (r.stderr || "").split("\n")[0])); }
}
console.log("\n" + gefangen + " gefangen · " + durch + " durchgerutscht · " + falsch + " aus falschem Grund · " + tot + " tote Anker");
process.exitCode = (durch || falsch || tot) ? 1 : 0;
