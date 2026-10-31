**🔬 Regel: Forschung nur in Kimhub (Klaus 2026-10-31: „einheitlich alles in Kimhub … in den einzelnen Repos soll keine Forschungseinträge sein“):** jeder Forschungseintrag (Sitzungs-Befunde, Messungen, Stunden-Auswertungen, Forschungsnotizen) kommt nach **Kimhub `forschung/messungen/`**; in diesem Repo werden keine Forschungseinträge geführt und keine Forschungsdateien angelegt. Öffentliche Forschungs**aufgaben** stehen in Sage-Protokol.

# Küchenzettel — Sitzungs-Anker

Installierbare PWA (`index.html`, kein Build-Schritt). **SBKIM-Knoten seit 2026-10-15**
(Klaus: andocken; Sage Sammel-Brief Schritt 4b): Schublade `kuechenzettel`, 13 Module
byte-1:1 aus Sage in `modules/`, Klebstoff `assets/sbkim-init.js`, Identität
`assets/siegel-inhalt.js`, feste Lampen-Leiste in der Kopfzeile (kein Modul 17).
Der Nachrichten-Teil (`comm-core/`) ist davon getrennt und bleibt unberührt.

## Prüfen

```bash
npm test                 # tools/drift-guard.mjs + tests/comm-core.test.mjs
npm run test:browser     # Hülle + Knoten im echten Browser (playwright-core)
npm run gegenprobe       # nimmt jede Knoten-Zusicherung einzeln weg
```

## Was hier leicht kaputtgeht

- **`comm-core/` ist eine byte-1:1-Kopie** — der Drift-Guard (`tools/drift-guard.mjs`,
  Teil von `npm test`) wacht darüber. Reift die Quelle, wird sie **dort** gepflegt und
  neu kopiert, nicht hier abgewandelt.
- **Cache-Bump:** `CACHE_VERSION` in `sw.js` (`kuechenzettel-vN`) erhöhen, wenn eine
  Datei aus dem Vorrat sich ändert. Sonst liefert der Service-Worker die alte Fassung.
- Icons werden von `tools/gen-icons.mjs` erzeugt, nicht von Hand.
- **SBKIM-Module** in `modules/` sind Kanon aus Sage — nie hier ändern; nachgezogen wird
  mit Sages `tools/kanon-verteilen.mjs`, der auch die Pins in `tests/knoten.test.mjs` hebt.
  `modules/noble-secp256k1.js` ist dieselbe Datei wie `comm-core/vendor/…` (sha
  `8f3879ca`); 05b holt sie per relativem Import neben sich.
- **`window.SBKIM_DB_SUFFIX` steht im `<head>`** vor jedem Skript; nie ändern.
- Am Handy ist die Kopfleiste knapp: unter 640 px weicht der Untertitel, unter 380 px die
  Nadel (`assets/sbkim.css`, gemessen bei 320/360/412 px).

## ⬇ Installieren-Knopf (2026-10-18)

Klaus: *„Den Installieren-Button überall fest einbauen … Wenn es kein Einstellungsfeld gibt, dann oben ins Menü."*
Küchenzettel hat keine Einstellungen, deshalb steht ⬇ in der Kopfleiste vor 💬 (`data-vor="msgBtn"`, nur das Zeichen).
`assets/installieren.js` ist byte-1:1 aus Sage-Protokol (SHA-256 `e0644084…c3c3`) — dort pflegen, hier neu kopieren.
Als installierte App verschwindet er. Unter 340 px werden die Kopf-Knöpfe 29 px breit und der Abstand 4 px, sonst
reicht die Zeile nicht (gemessen 320/360/412 px). Im Vorrat (`?v=1`), Cache `kuechenzettel-v11`.
⚠ Benannt, nicht angefasst: drei Fälle in `tests/gegenprobe_knoten.mjs` (K8, K11, K13) zielen noch auf `?v=3`/`v3` und
sind damit tote Anker. ⚠ Am Tablet/Handy nicht gemessen.

## Netzweit

Freibrief zum Selbst-Mergen · Gerätename · frisch von `origin/main` vor jeder Arbeit ·
Ton · kein PII · Ehrlichkeit stehen **einmal** in
**[`Sage-Protokol/docs/NETZWEIT.md`](https://github.com/lausiklauskn-png/Sage-Protokol/blob/main/docs/NETZWEIT.md)**.

```bash
git fetch origin --quiet && git checkout -B <branch> origin/main
git push -u origin refs/heads/<branch>:refs/heads/<branch>
git diff --stat origin/main origin/<branch>     # leer = der PR wäre leer
```
