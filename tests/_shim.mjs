// Test-Shim (NUR headless): noble-secp256k1 liest crypto.web = self.crypto.
// Im Browser existiert `self` nativ; in Node muss es vor dem noble-Import
// gesetzt sein. Diese Datei wird als ERSTER Import geladen (Eval-Reihenfolge),
// bevor irgendein Modul noble zieht. Ändert KEINEN Vendor-Baustein.
globalThis.self = globalThis;
