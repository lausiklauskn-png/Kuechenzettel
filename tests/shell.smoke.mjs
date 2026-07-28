/*
 * Shell-Smoke (Küchenzettel) — echter Browser (Chromium), headless.
 * Prüft die VERDRAHTUNG der EHRLICHEN Hülle mit comm-core im Browser:
 *   - die Rezept-Notiz-App rendert,
 *   - der sichtbare Knopf 💬 öffnet die Ersteinrichtung,
 *   - ein Passwort richtet die verschlüsselten Nachrichten ein (enroll),
 *   - nach dem Sperren entsperrt das richtige Passwort, das falsche nicht,
 *   - der Nachrichten-Bereich zeigt den eigenen Schlüssel,
 *   - die Suche ist nur Suche (öffnet keinen versteckten Bereich mehr),
 *   - Impressum & Datenschutz sind offen erreichbar,
 *   - die lokale Ablage ist ein namenloser Chiffrat-Klumpen (Schlüssel-Schutz
 *     auf dem Gerät), trägt aber keine Krypto-/Identitäts-Etiketten.
 * NICHT geprüft (ehrlich): echte öffentliche Relais (Netz), zweites Gerät,
 * Live-Mikrofon — das ist Klaus' Browser-Sichttest am Ende von Stufe A.
 *
 * Lauf: node tests/shell.smoke.mjs
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8393;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };

const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
await new Promise(r => setTimeout(r, 700));

let browser;
try {
  browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "networkidle" });

  // 1. Rezept-Notiz-App rendert
  ok((await page.title()).includes("Küchenzettel"), "Titel Küchenzettel");
  await page.waitForSelector(".zettel", { timeout: 5000 });
  ok((await page.$$(".zettel")).length >= 3, "Rezept-Karten sichtbar");
  ok(await page.$("#q"), "Notiz-/Suchfeld vorhanden");
  ok(await page.$("#msgBtn"), "sichtbarer Nachrichten-Knopf 💬 vorhanden");
  ok(!(await page.isVisible("#priv")), "Nachrichten-Bereich anfangs unsichtbar");

  // 2. Sichtbarer Knopf → Ersteinrichtung mit Passwort (enroll)
  const pw = "mein gutes passwort";
  await page.click("#msgBtn");
  await page.waitForSelector("#suP", { timeout: 4000 });
  ok(true, "💬 öffnet die Ersteinrichtung (offen benannt)");
  await page.fill("#suP", pw);
  await page.click("#suGo");
  await page.waitForSelector("#priv.show", { timeout: 4000 });
  ok(await page.isVisible("#priv"), "Passwort richtet die verschlüsselten Nachrichten ein");

  // lokale Ablage: namenloser Chiffrat-Klumpen (Schlüssel-Schutz auf dem Gerät)
  const rawStore = await page.evaluate(() => localStorage.getItem("kz_state_v1"));
  ok(rawStore && !/jason|sbkim|tresor|priv|pub|AES|PBKDF2/i.test(rawStore), "lokale Ablage trägt keine Krypto-/Identitäts-Etiketten");

  // 3. Nachrichten-Bereich zeigt den eigenen Schlüssel
  await page.waitForSelector("#myKey", { timeout: 3000 });
  const key = (await page.textContent("#myKey")).trim();
  ok(/^[0-9a-f]{64}$/.test(key), "eigener Schlüssel wird angezeigt");

  // 4. Schließen sperrt — falsches Passwort entsperrt NICHT, richtiges schon
  await page.click("#pvLock");
  await page.waitForTimeout(200);
  ok(!(await page.isVisible("#priv")), "Schließen sperrt und verbirgt den Bereich");

  await page.click("#msgBtn");
  await page.waitForSelector("#ulP", { timeout: 4000 });
  await page.fill("#ulP", "falsches passwort");
  await page.click("#ulGo");
  await page.waitForTimeout(400);
  ok(!(await page.isVisible("#priv")), "falsches Passwort entsperrt NICHT");
  await page.fill("#ulP", pw);
  await page.click("#ulGo");
  await page.waitForSelector("#priv.show", { timeout: 4000 });
  ok(await page.isVisible("#priv"), "richtiges Passwort entsperrt");

  // 5. Suche ist nur Suche — öffnet keinen versteckten Bereich mehr
  await page.click("#pvLock");
  await page.evaluate(() => window.__kz.CommCore.unlock.lock());
  await page.fill("#q", "kartoffeln");
  await page.evaluate(() => window.__kz.handleQuick("kartoffeln"));
  await page.waitForTimeout(300);
  ok(!(await page.isVisible("#priv")), "Suche öffnet nichts (ist nur Suche)");

  // 6. Impressum & Datenschutz offen erreichbar
  await page.click("#imprBtn");
  await page.waitForSelector("#sheet", { timeout: 3000 });
  const sheetTxt = await page.textContent("#sheet");
  ok(/Impressum/i.test(sheetTxt) && /Ende-zu-Ende/i.test(sheetTxt), "Impressum & Datenschutz offen erreichbar");

  ok(errors.length === 0, "keine JS-Fehler im Browser (" + errors.join(" | ") + ")");
} catch (e) {
  fail++; console.error(e);
} finally {
  if (browser) await browser.close();
  srv.kill();
}
console.log(`\nShell-Smoke (Küchenzettel): ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
