/*
 * Knoten-Probe (Küchenzettel) — der SBKIM-Andock (Sammel-Brief 2026-10-15, Schritt 4b).
 *
 * Teil 1 ohne Browser: 13 Module byte-gleich mit Sage, Schublade im <head>,
 * Kette, 05b getrennt, Vorrat, Identität ohne Nutzerdaten.
 * Teil 2 im echten Browser (Chromium): der Knoten startet, das Siegel steht in
 * der Kopfzeile, die Notizen laufen weiter, und beim Laden entsteht kein
 * WebSocket.
 *
 * Gegenprobe: tests/gegenprobe_knoten.mjs nimmt jede Zusicherung einzeln weg.
 * Lauf: node tests/knoten.test.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
let gruen = 0, rot = 0;
function ok(name, bed, extra) {
  if (bed) { gruen++; console.log("  ✓ " + name); }
  else { rot++; console.log("  ✗ ROT " + name + (extra ? " — " + extra : "")); }
}
const lies = (f) => readFileSync(join(WURZEL, f), "utf8");
const sha = (f) => createHash("sha256").update(readFileSync(join(WURZEL, f))).digest("hex");

/* Die 13 Module sind byte-1:1 aus Sage-Protokol/src/modules/. Wer ein Modul neu
   kopiert, zieht hier den Pin nach (tools/kanon-verteilen.mjs tut das selbst). */
const KNOTEN_PINS = {
  "modules/01_storage.js": "5a5a4bf64dfcc107da7ed70fb755d7db5cce7d80e963b3e2fbc2004537747820",
  "modules/02_spore.js": "0cbf0664e2a79f1301c03e52f7ac0030d4b2961f03b97b38e8634827a52353c5",
  "modules/03_embedding.js": "2e31baa09a2959c95efff8eecd224e8343e75695b4b293aa35209d8f96d1f3b5",
  "modules/04_match.js": "721eecc3c0d6ea4c259259e6071215ec1cd16f1c43c87b42ce9e72e9a0b5e41c",
  "modules/05_anastomose.js": "255ac79aeb3b0203e92f0cebd0a905e47c488b43efe18f41332a7d35520bbf23",
  "modules/05b_nostr_relay.js": "37eee5b196b3efad57131edd1cc3c0ee23acb97b5ca40740d6a0771db4b4a421",
  "modules/07_apoptose.js": "0acdd6ab2d95e131fa6953061cc0e95a2396e05fff091a7dc690b2668a4c035a",
  "modules/15_membran.js": "829a5bc01976b59c5ce428125314b87b314b6212cd5a473634c2d22c02579397",
  "modules/16_siegel.js": "75e23d7b0236408070edab8dd4b6c67bcba467d485466a96921b06da1be625fa",
  "modules/16b_andock_wizard.js": "c415eafdb1b660a5256e19957c667074b64b0c3990cc8acc4daeeef34a57e85d",
  "modules/23_rendezvous.js": "8b5edc106b68f23ddd1a45afd3bc52ae5f753399ba5d19a2ec065e794f718075",
  "modules/23_rendezvous_ui.js": "af3385d971110900afe44cd9e86c7528ca27c58122508ce9dfc78acd31ccdccc",
  "modules/noble-secp256k1.js": "8f3879ca422c4fdfe7ca0361688636fa7cc550a59bd94d512ed6ec79aa3d55d1"
};

const seite = lies("index.html"), sw = lies("sw.js"), glue = lies("assets/sbkim-init.js");
const vSeite = [...new Set((seite.match(/(?:sbkim-init|05b_nostr_relay|sbkim)\.(?:js|css)\?v=(\d+)/g) || []).map((x) => x.split("=")[1]))];
const core = (sw.match(/const SHELL = \[([\s\S]*?)\];/) || [])[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1).replace(/^\.\//, ""));

console.log("── Teil 1 · ohne Browser");
{
  const falsch = Object.keys(KNOTEN_PINS).filter((f) => !existsSync(join(WURZEL, f)) || sha(f) !== KNOTEN_PINS[f]);
  ok("K1 die 13 Module sind byte-gleich mit Sage", falsch.length === 0, falsch.join(", "));
  ok("K2 Modul 23 trägt S1 (unsignierte Fragen höchstens 2 je Minute)", /var RDV_QUERY_UNSIGNED_MAX_PER_MIN = 2;/.test(lies("modules/23_rendezvous.js")));
  const kopf = seite.split("</head>")[0];
  const suffixAt = kopf.search(/<script>\s*window\.SBKIM_DB_SUFFIX\s*=\s*"kuechenzettel"\s*;?\s*<\/script>/);
  const erstesSkript = kopf.search(/<script(?![^>]*>\s*window\.SBKIM_DB_SUFFIX)/);
  ok("K3 Schublade „kuechenzettel“ steht im <head> vor jedem anderen Skript", suffixAt >= 0 && (erstesSkript < 0 || suffixAt < erstesSkript), suffixAt + "/" + erstesSkript);
  ok("K4 Klebstoff nutzt dieselbe Schublade", /dbSuffix:\s*"kuechenzettel"/.test(glue));
  const kette = (glue.match(/var KANON = \[([\s\S]*?)\n\s*\];/) || [])[1] || "";
  const glieder = kette.split("\n").map((z) => z.replace(/\/\/.*$/, "").trim()).filter((z) => z.startsWith("["));
  const ohneKomma = glieder.slice(0, -1).filter((z) => !z.endsWith(","));
  ok("K5 zwischen den Kettengliedern steht je ein Komma", glieder.length > 0 && ohneKomma.length === 0, "ohne Komma: " + ohneKomma.join(" | "));
  const namen = glieder.map((z) => (z.match(/"([^"]+\.js)"/) || [])[1]);
  const pflicht = Object.keys(KNOTEN_PINS).filter((f) => !/noble|05b_/.test(f)).concat(["assets/siegel-inhalt.js"]);
  ok("K6 die Kette lädt jedes Pflicht-Modul (ohne 05b) und die Identität", pflicht.every((f) => namen.includes(f)), pflicht.filter((f) => !namen.includes(f)).join(", "));
  const vKette = (glue.match(/var V = "\?v=(\d+)";/) || [])[1];
  ok("K7 Kette, Seite und Vorrat tragen dieselbe ?v=", vSeite.length === 1 && vKette === vSeite[0] && core.includes("modules/01_storage.js?v=" + vKette), vKette + " / " + vSeite.join(","));
  ok("K8 05b als ES-Modul mit eigener Zeile, NICHT in der Kette", /<script type="module" src="\.\/modules\/05b_nostr_relay\.js\?v=\d+"><\/script>/.test(seite) && !/05b_/.test(kette));
  ok("K9 kein Modul 17 (feste Leiste in der Kopfzeile)", !/17_/.test(kette) && !/17_/.test(seite) && !existsSync(join(WURZEL, "modules/17_floating_widget.js")));
  ok("K10 die Identität steht vor dem Andock-Werkzeug", namen.indexOf("assets/siegel-inhalt.js") >= 0 && namen.indexOf("assets/siegel-inhalt.js") < namen.indexOf("modules/16b_andock_wizard.js"));
  const fehlt = Object.keys(KNOTEN_PINS).concat(["assets/sbkim-init.js", "assets/siegel-inhalt.js", "assets/sbkim.css", "sicherheit.html"])
    .filter((f) => !core.some((u) => u.split("?")[0] === f));
  ok("K11 jedes Modul, Klebstoff, Identität, Stil und sicherheit.html stehen im Vorrat", fehlt.length === 0, fehlt.join(", "));
  ok("K12 noble steht ohne ?v= im Vorrat (05b holt es per import ohne Zusatz)", core.includes("modules/noble-secp256k1.js"));
  ok("K13 Cache erhöht (kuechenzettel-v3 oder später)", Number((sw.match(/CACHE_VERSION = "kuechenzettel-v(\d+)"/) || [])[1]) >= 3);
  ok("K14 keine fremde Herkunft (allowedOrigins leer)", /allowedOrigins:\s*\[\]/.test(glue));
  ok("K15 Siegel-Band „KÜCHENZETTEL“ im Badge-Platz der Kopfleiste", /ribbonText:\s*"KÜCHENZETTEL"/.test(glue) && /badgeSelector:\s*"#siegel-platz"/.test(glue));
  ok("K16 beim Start keine Identität erzwungen (kein ensureIdentity)", !/ensureIdentity\s*\(/.test(glue.replace(/\/\*[\s\S]*?\*\//g, "")));
  ok("K17 Gerätename über den Klebstoff ins Verbinden-Panel, nur als Text", /setAttribute\("data-sbkim-geraetename"/.test(glue) && /getElementById\("sbkim-rdv-panel"\)/.test(glue) && !/innerHTML/.test(glue));
  const leiste = ['id="netzleiste"', 'id="lamp-alive"', 'id="lamp-traffic"', 'id="lamp-fremd"', 'id="siegel-platz"', "data-sbkim-mycel-platz"];
  ok("K18 die Kopfleiste trägt Lampen, Siegel-Platz und Mycel-Platz", leiste.every((x) => seite.includes(x)), leiste.filter((x) => !seite.includes(x)).join(", "));
  ok("K19 sicherheit.html liegt neben der Seite (sonst 404 hinter „Ausführlich erklärt“)", existsSync(join(WURZEL, "sicherheit.html")) && /iframe\.src = "sicherheit\.html"/.test(lies("modules/16b_andock_wizard.js")));
  const fenster = {}; new Function("window", lies("assets/siegel-inhalt.js"))(fenster);
  const W = fenster.SBKIM_SIEGEL_WIZ || {};
  const d = String(W.domainDescription || "");
  ok("K20 Beschreibung beginnt mit dem eigenen Namen und nennt Zweck, SBKIM, Mycel, Sage-Protokol, Knoten", d.startsWith("Küchenzettel") && ["ZWECK", "SBKIM", "Mycel", "Sage-Protokol", "Knoten"].every((w) => d.includes(w)));
  ok("K21 Beschreibung trägt keine Mailadresse, keine Anschrift, keine Telefonnummer", !/@|\d{5}\s|\+?\d[\d ]{7,}/.test(d));
  ok("K22 Endpunkt ist die eigene Adresse", W.endpoint === "https://lausiklauskn-png.github.io/Kuechenzettel/" && W.nodeName === "Küchenzettel");
}

let pw;
try { pw = await import("playwright-core"); } catch {
  console.log("⊘ Teil 2 nicht lauffähig: playwright-core fehlt (npm install). " + gruen + " grün · " + rot + " ROT ohne Browser.");
  process.exit(rot ? 1 : 2);
}
const kandidaten = ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"];
let exe = null;
try { for (const d of (await import("node:fs")).readdirSync("/opt/pw-browsers")) kandidaten.push("/opt/pw-browsers/" + d + "/chrome-linux/chrome"); } catch {}
exe = kandidaten.find((p) => existsSync(p) && !p.endsWith("/chromium")) || null;
if (!exe) { console.log("⊘ Teil 2 nicht lauffähig: kein Chromium gefunden."); process.exit(rot ? 1 : 2); }

const TYP = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((q, a) => {
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = join(WURZEL, p);
  if (!f.startsWith(WURZEL) || !existsSync(f) || /node_modules|\.git/.test(f)) { a.writeHead(404); a.end(); return; }
  a.writeHead(200, { "content-type": TYP[extname(f)] || "application/octet-stream" });
  a.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASIS = "http://127.0.0.1:" + server.address().port + "/";
const browser = await pw.chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

console.log("── Teil 2 · im Browser");
try {
  for (const breite of [1280, 360, 320]) {
    const ctx = await browser.newContext({ viewport: { width: breite, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => { const W = window.WebSocket; window.__wsZahl = 0;
      window.WebSocket = function (...a) { window.__wsZahl++; return new W(...a); }; window.WebSocket.prototype = W.prototype; });
    const fehler = [], fremd = [];
    page.on("pageerror", (e) => fehler.push(String(e)));
    page.on("request", (r) => { if (!r.url().startsWith(BASIS) && !r.url().startsWith("data:")) fremd.push(r.url()); });
    await page.goto(BASIS + "index.html");
    const bereit = await page.waitForFunction(() => window.KZ_KNOTEN_BEREIT === true, null, { timeout: 30000 }).then(() => true, () => false);
    ok(`B1 ${breite}: der Knoten startet (Kette durchgelaufen)`, bereit);
    ok(`B2 ${breite}: die Seite lädt ohne Skriptfehler`, fehler.length === 0, fehler.join(" | ").slice(0, 300));
    const m = await page.evaluate(() => ({
      module: ["SbkimStorage", "SbkimSpore", "SbkimEmbedding", "SbkimMatch", "SbkimAnastomose", "SbkimNostrRelay", "SbkimApoptose",
        "SbkimMembrane", "SbkimSiegel", "SbkimRendezvous", "SbkimRendezvousUI"].filter((g) => !window[g]),
      siegel: !!document.querySelector("#siegel-platz #sbkim-siegel-badge"),
      zettel: document.querySelectorAll(".zettel").length,
      suffix: window.SBKIM_DB_SUFFIX,
    }));
    ok(`B3 ${breite}: alle Pflicht-Module sind geladen`, m.module.length === 0, m.module.join(", "));
    ok(`B4 ${breite}: das Siegel steht im Platz der Kopfleiste`, m.siegel);
    ok(`B5 ${breite}: die Rezept-Zettel erscheinen weiter`, m.zettel >= 3, String(m.zettel));
    const box = await page.evaluate(() => { const r = document.getElementById("lampen").getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth }; });
    ok(`B6 ${breite}: die Lampen stehen ganz im Schirm`, box.l >= 0 && box.r <= box.w, JSON.stringify(box));
    const drin = await page.evaluate(() => { const k = document.getElementById("lampen").getBoundingClientRect();
      return [...document.querySelectorAll("#lampen .lamp")].map((l) => l.getBoundingClientRect()).filter((r) => r.width > 0)
        .every((r) => r.left >= k.left - 0.5 && r.right <= k.right + 0.5); });
    ok(`B11 ${breite}: die Lampen passen in ihren Knopf (er erbt nicht die feste Breite der Kopfknöpfe)`, drin);
    const knoepfe = await page.evaluate(() => [...document.querySelectorAll("header .hd > *")].map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.className, l: r.left, r: r.right }; }).filter((k) => k.r > innerWidth + 0.5 || k.l < -0.5));
    ok(`B10 ${breite}: kein Teil der Kopfleiste ragt aus dem Schirm`, knoepfe.length === 0, JSON.stringify(knoepfe));
    if (breite < 1100) {
      await page.click("#lampen");
      const auf = await page.evaluate(() => { const r = document.getElementById("netz-mehr").getBoundingClientRect(); return { sichtbar: r.width > 0, l: r.left, r: r.right, w: innerWidth }; });
      ok(`B7 ${breite}: ein Tipp auf die Lampen klappt Siegel und Netz auf, ohne über den Rand`, auf.sichtbar && auf.l >= 0 && auf.r <= auf.w, JSON.stringify(auf));
    }
    await page.waitForTimeout(1500);
    const ws = await page.evaluate(() => window.__wsZahl);
    ok(`B8 ${breite}: beim Laden entsteht kein WebSocket`, ws === 0, ws + " erzeugt");
    ok(`B9 ${breite}: beim Laden kein Abruf außer Haus`, fremd.length === 0, fremd.slice(0, 3).join(", "));
    await ctx.close();
  }
} catch (e) {
  ok("die Probe läuft durch (Absturz: " + String(e && e.message || e).slice(0, 200) + ")", false);
} finally {
  await browser.close().catch(() => {}); server.close();
}
console.log("\n" + gruen + " grün · " + rot + " ROT");
process.exitCode = rot ? 1 : 0;
