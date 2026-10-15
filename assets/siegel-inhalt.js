/*
 * Siegel-Inhalt — DIE IDENTITÄT DIESES KNOTENS, und sonst nichts.
 *
 * Der Andock-Wizard liegt byte-1:1 aus Sage in `modules/16b_andock_wizard.js`
 * und liest nur `window.SBKIM_SIEGEL_WIZ`. Diese Datei wird NIE verteilt: sie
 * trägt die Bedeutung des Knotens (Sage-Protokol/docs/INTERFACES.md §11.9).
 *
 * ⚠ Modul 03 rechnet aus der Beschreibung den Domänen-Vektor. Das Wichtigste
 * steht vorn (Name, Zweck, Protokoll). Kein Rezept eines Nutzers, keine
 * Nachricht und kein Schlüssel gehören hierher — die Beschreibung geht ins Netz.
 */
(function () {
  "use strict";
  window.SBKIM_SIEGEL_WIZ = {
    domain: "Rezepte/Kochen/Notizen",
    endpoint: "https://lausiklauskn-png.github.io/Kuechenzettel/",
    nodeType: "hybrid",
    nodeName: "Küchenzettel",
    domainDescription: "Küchenzettel ist eine Rezept-Notiz-App im SBKIM-Mycel und ein eigener Knoten. ZWECK: Rezepte als schnelle Zettel aufschreiben, wiederfinden und nachkochen: Zutaten, Schritte, Zeit und Schwierigkeit, Kategorien wie Schnell, Auflauf, Salate, Süßes und Suppen, Favoriten, Foto-Notiz von der Kamera und Diktieren statt Tippen. Dazu ein offen benannter Bereich für Ende-zu-Ende-verschlüsselte Nachrichten mit eigenem Passwort. FORSCHUNG UND PROTOKOLL: Küchenzettel gehört zum SBKIM-Protokoll (Semantisches Bidirektionales KI-Matching), der offenen Spezifikation aus dem Sage-Protokol. Es ist selbst ein Knoten: eigene signierte Spore, eigene Kennung, und mit dem Netz verbindet es sich nur auf ausdrücklichen Klick. WAS ES NICHT IST: kein Rezept-Portal und kein Shop; es lädt keine Rezepte hoch. Die Zettel bleiben im Browser des Geräts. FÜR WEN: für alle, die zu Hause kochen und ihre Rezepte schnell notieren und wiederfinden wollen.",
    domainKeywords: ["SBKIM", "SBKIM-Protokoll", "Sage-Protokol", "Mycel", "Knoten", "Küchenzettel", "Rezept", "Rezepte", "Kochen", "Notizen", "Zutaten", "Kategorien", "Favoriten", "Foto-Notiz", "Diktieren", "verschlüsselte Nachrichten", "offline", "Daten bleiben auf dem Gerät"],
    stammCategories: ["Rezepte", "Kochen", "Notizen"],
    guestCategories: ["Küche", "Essen", "Siegel"],
    backupPrefix: "kuechenzettel-backup",
  };
})();
