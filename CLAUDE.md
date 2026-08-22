# Küchenzettel — Sitzungs-Anker

Installierbare PWA (`index.html`, kein Build-Schritt). **Kein SBKIM-Knoten** — dieses
Repo bindet keine SBKIM-Module ein.

## Prüfen

```bash
npm test    # tools/drift-guard.mjs + tests/comm-core.test.mjs
```

## Was hier leicht kaputtgeht

- **`comm-core/` ist eine byte-1:1-Kopie** — der Drift-Guard (`tools/drift-guard.mjs`,
  Teil von `npm test`) wacht darüber. Reift die Quelle, wird sie **dort** gepflegt und
  neu kopiert, nicht hier abgewandelt.
- **Cache-Bump:** `CACHE_VERSION` in `sw.js` (`kuechenzettel-vN`) erhöhen, wenn eine
  Datei aus dem Vorrat sich ändert. Sonst liefert der Service-Worker die alte Fassung.
- Icons werden von `tools/gen-icons.mjs` erzeugt, nicht von Hand.

## Netzweit

Freibrief zum Selbst-Mergen · Gerätename · frisch von `origin/main` vor jeder Arbeit ·
Ton · kein PII · Ehrlichkeit stehen **einmal** in
**[`Sage-Protokol/docs/NETZWEIT.md`](https://github.com/lausiklauskn-png/Sage-Protokol/blob/main/docs/NETZWEIT.md)**.

```bash
git fetch origin --quiet && git checkout -B <branch> origin/main
git push -u origin refs/heads/<branch>:refs/heads/<branch>
git diff --stat origin/main origin/<branch>     # leer = der PR wäre leer
```
