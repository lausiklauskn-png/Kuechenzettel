# comm-core — der geteilte Kommunikations-Kern (Stufe A / Simulator)

**EIN Motor, mehrere Karosserien.** Dieselben Dateien liegen byte-1:1 in jeder
Tarn-Hülle (kochfreund, kuechenzettel) und werden vom **Drift-Guard**
(`tools/drift-guard.mjs`, Teil von `npm test`) per SHA-256 bewacht. comm-core
**dichtet nichts hinzu** — er **komponiert** nur vorhandene, getestete Bausteine.

## Was hier byte-1:1 kopiert ist (nicht abwandeln)

| Datei | Herkunft | Rolle |
|---|---|---|
| `vendor/noble-secp256k1.js` | Privat-Brain | secp256k1 / schnorr (für ECDH + Transport-Signatur) |
| `vendor/dm_crypto.js` | Privat-Brain | ECDH-E2E + TOFU-Sicherheitsnummer (SAS) |
| `vendor/jasonlib.js` | Jasons-Tresor (`JASONLIB-CORE`) | AES-256-GCM/PBKDF2-600k Tresor + JT3v5 Shamir 3/5 |
| `vendor/20_schluessel_safe.js` | Sage-Protokol Modul 20 | Shamir 2/3 Passwort-Wiederherstellung |
| `vendor/21_spracheingabe.js` | Sage-Protokol Modul 21 | gesprochenes Losungswort → Text (nur Auslöser) |

Reift ein Baustein, wird er im Ursprungs-Repo gepflegt und hier **neu kopiert** +
der erwartete Hash im Drift-Guard aktualisiert — nie am Ort abgewandelt.

## Was hier neu ist (der Klebstoff)

- `comm-core.js` — die öffentliche Fläche `CommCore` (identity/enroll/unlock/
  pairing/circle/msg/relay/mode/call), reine Komposition der Bausteine.
- `relay-transport.js` — Nostr-Relais-Muster (Sage Modul 05b) mit **eingebackener**
  öffentlicher Relais-Liste + **berechneter** Rotation, **ohne** relay.family-projekt.de,
  **ohne** Live-Liste von GitHub.

## Schnittstelle (Stufe-A-Vertrag)

```
CommCore.init({ store, storeKey, seed, euPolicy, mode, now?, makeTransport? })
CommCore.identity.{ create(), pubKey(), exportPacket(pw), importPacket(pkt, pw, localPhrase?) }
CommCore.enroll.fromSpokenPhrase(text) -> { ok, created }     // Ersteinrichtung
CommCore.unlock.{ fromSpokenPhrase(text) -> bool, lock() }    // versteckten Bereich öffnen
CommCore.pairing.{ addContact(pubHex,name), listContacts(), removeContact(pubHex), safetyNumber(peer) }
CommCore.circle.{ splitPhrase(t), combinePhrase(sh), splitPersonal(t), recoverPersonal(sh) }
CommCore.msg.{ send(peer, {text|voice|image}), inbox(peer, {waitMs,lookback}) }
CommCore.relay.{ currentByTimeSeed(), tryNextOnFail() }
CommCore.mode.{ get(), set('normal'|'vorsicht') }
CommCore.call.{ isActive()->false, start()->{available:false} }   // Anruf schläft (Stufe B)
```

Der Sprach-Auslöser läuft in der **Hülle** über `window.SbkimSpeech` (Modul 21);
der erkannte Text geht an `enroll`/`unlock.fromSpokenPhrase`.

## Ehrliche Grenzen (kein falsches Sicherheitsgefühl)

- Der Simulator beweist die **Mechanik**, **nicht** die Tarnung gegen ein echtes
  Regime (konservativ entworfen, nicht getestet).
- **App-Hopping** schlägt App-Verbote, **nicht** Netz-Fingerprinting.
- **Vorsicht-Modus** (server-los): höhere Metadaten-Sichtbarkeit, schwächerer
  Briefkasten. In Stufe A nutzen beide Modi den öffentlichen Relais-Pool
  (eigener Server = Stufe B).
- Das gesprochene Losungswort ist **Wissen**, kein biometrisches Schloss; seine
  Entropie ist begrenzt — PBKDF2-600k bremst Brute-Force, ersetzt aber kein
  starkes Passwort.
- Für den **Ernstfall** (gezielte Forensik, aktive Einzel-Überwachung): erprobte
  Werkzeuge — **Signal** (mit Zensur-Umgehung), **Tor-Bridges / Snowflake**.

**Verboten (Plan):** relay.family-projekt.de · Live-GitHub-Abgleich der
Relais-Liste · echte Handy-SMS.

## Beweis

```bash
npm test    # Drift-Guard (5 byte-1:1) + comm-core-Mechanik (33 headless-Prüfungen)
```

Der Browser-Sichttest (Klaus + Freund, zwei echte Geräte, echte öffentliche
Relais) ist **nicht ersetzbar** und steht am Ende von Stufe A.
