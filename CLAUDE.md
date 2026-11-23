# Fermate – Projektbeschreibung für Claude Code

Fermate ist ein kleines, modulares Notensatzprogramm als WebApp für den Musikunterricht
(Schwerpunkt iPad). Das Hauptziel: **Notentext und Klang verbinden.** Schüler.innen sollen
sehen, was sie hören, und hören, was sie schreiben. Wer eine Melodie notiert, kann sie sofort
abspielen und entscheiden, ob sie gefällt.

Fermate ist kein Ersatz für MuseScore. Es ist absichtlich klein. Jedes Modul schaltet einen
etwas größeren Funktionsumfang frei. **Modul 1 (Prototyp) ist fertig.** Als Nächstes wird die
**Vollversion** geplant (Abschnitt 5); gebaut wird sie erst, wenn ihr Umfang feststeht.
Weitere Module entstehen danach durch Reduzieren oder leichtes Abändern der Vollversion
(beschlossen 21.11.2026, ein eigenes Modul 2 als nächster Schritt entfällt).

---

## 1. Arbeitsweise

- Ich (Jonathan, Musiklehrer) habe wenig Programmiererfahrung (etwas Python). Erkläre
  Entscheidungen kurz und verständlich, ohne Fachjargon vorauszusetzen.
- Arbeite in kleinen Schritten (siehe Abschnitt 7). Nach jedem Schritt muss die App
  lauffähig sein. Sag mir, wie ich das Ergebnis im Browser und auf dem iPad ansehe.
- Baue nichts, was nicht beschlossen ist (Modul 1, später die festgelegte Vollversion), auch
  keine „kleinen Extras“. Wenn etwas fehlt oder
  unklar ist, frag nach.
- Neue Abhängigkeiten (npm-Pakete) nur nach Rückfrage, außer den in Abschnitt 2 genannten.
- Ein Commit pro abgeschlossenem Schritt, Commit-Nachrichten auf Deutsch.
- Programmlogik (Datenmodell, Eingaberegeln, Takt-Prüfung, Dateinamen) bekommt Tests.

## 2. Technik

| Zweck | Wahl |
| --- | --- |
| Sprache / Build | TypeScript, Vite, kein UI-Framework (reines DOM) |
| Notendarstellung | VexFlow 5 (SVG-Ausgabe) |
| Wiedergabe | Tone.js mit `Tone.Sampler` |
| Klänge | Samples aus *tonejs-instruments* (nbrosowsky), nur eine Auswahl von Tönen pro Instrument in `public/samples/<instrument>/` (Liste in `src/playback/samples.ts`, Herkunft in `public/samples/LICENSE.txt`). Modul 1 lädt nur seine 11 Klavier-Töne. Lizenz CC BY 3.0 → Namensnennung auf der Info-Seite |
| PDF | jsPDF; das Notenbild wird mit VexFlow auf ein Canvas gezeichnet und als Bild (~300 dpi) eingebettet. svg2pdf.js entfällt, weil es die Notenschrift Bravura (nur WOFF2) nicht einbetten kann |
| ZIP | fflate |
| Teilen | Web Share API mit Dateien (`navigator.share({ files })`), Rückfall: Download |
| Tests | Vitest |
| Hosting | statisch über GitHub Pages, kein Server |

Weitere Vorgaben:

- **Kein Server, keine Konten, keine Anmeldung.** Alle Daten bleiben auf dem Gerät.
- Code, Bezeichner und Kommentare auf Englisch, alle Texte der Oberfläche auf Deutsch.
- Texte der Oberfläche: neutrale Formen bevorzugen, sonst Gendern mit Punkt
  (Schüler.innen, Lehrer.innen). Nur wenn das Wort vor dem Punkt allein existiert, also nie
  „Kolleg.innen“, sondern „Kolleginnen und Kollegen“.
- `localStorage` immer in `try/catch` kapseln, es kann fehlen oder leer sein.
- Audio darf erst nach einer Berührung starten (iOS). `Tone.start()` beim ersten Tippen
  aufrufen, nicht erst beim ersten Play.

### Gestaltung

Schlicht und ruhig, nichts darf vom Notenbild ablenken. Das Notensystem nimmt den größten
Teil des Bildschirms ein, alles andere tritt zurück.

- **Farbe:** ein warmes Gelb-Orange als einzige Akzentfarbe, sonst nur warme Neutraltöne.
  Alle Farben als CSS-Variablen an einer Stelle festlegen, damit sie leicht änderbar sind.
  Vorschlag:
  - `--accent: #F2A93B` (warmes Gelb-Orange): gewählter Notenwert, aktive Buttons, Cursor,
    mitlaufende Markierung bei der Wiedergabe
  - `--accent-soft: #FCE7C3`: Flächen, z. B. ausgewählte Note oder Takt
  - `--accent-text: #8A4B00`: Akzent als Text oder Symbol auf hellem Grund
  - `--bg: #FFFBF4`, `--surface: #FFFFFF`, `--text: #2B2520`, `--muted: #8C8178`
- **Kontrast:** Texte und Symbole erfüllen mindestens WCAG AA. Auf `--accent` steht immer
  dunkler Text (`--text`), nie weißer.
- **Notenbild:** Noten, Linien und Schlüssel bleiben schwarz bzw. `--text` auf hellem Grund.
  Farbe im Notenbild nur für Zustände: Cursor, Auswahl, Vorschau-Note (halbtransparent),
  klingende Note.
- **Schrift:** eine runde Schrift für die ganze Oberfläche, z. B. **Nunito** (SIL Open Font
  License). Die Schriftdateien liegen im Projekt (`public/fonts/`) und werden **nicht** von
  Google Fonts oder einem anderen fremden Server geladen (Datenschutz, später offline nutzbar).
  Die Notensymbole kommen weiter aus der VexFlow-Notenschrift.
- **Formen:** abgerundete Ecken, keine Schatten, keine Verläufe, keine Animationen außer der
  mitlaufenden Markierung und dem Zeitbalken im Button „Notennamen“. Symbole in Leisten
  immer mit kurzer Beschriftung („Halbe“, „Abspielen“), damit niemand raten muss.
  Ausnahme: die Buttons „Neu“ (+), „Speichern und teilen“ (Teilen-Symbol, bis 22.11.2026 „Abgeben“) und „Einstellungen“ (Zahnrad)
  zeigen nur ein gezeichnetes SVG-Symbol und stehen immer ganz oben rechts (Name als
  Tooltip und für Screenreader). In der Vollversion öffnet „+“ eine kleine Auswahl (siehe
  Abschnitt 5, „Dateien“).
  Zweite Ausnahme (nur Vollversion, beschlossen 22.11.2026): Die Notenwerte (Ganze bis
  Sechzehntel), Kreuz, Be, Auflösung und Oktave höher/tiefer („8va“ mit Pfeil nach oben bzw.
  unten, seit 23.11.2026) zeigen nur ihr Zeichen aus der Notenschrift, groß
  gezeichnet, Tippfläche weiter mindestens 44 × 44 pt, Name als Tooltip und für
  Screenreader. Die Zeichen sind hier selbst der Lerninhalt. „Kopieren“ und „Einfügen“ zeigen
  nur ihre bekannten Symbole (zwei Blätter, Klemmbrett; seit 23.11.2026, spart Platz in der
  Leiste). Ebenso in der oberen Leiste (seit 23.11.2026): „Abspielen“ (Dreieck, beim Spielen
  Quadrat, beim Laden drei Punkte), „Mischpult“ (drei Schieberegler), „Kleiner“ und „Größer“
  (Lupe mit − bzw. +). Punkt, Triole, Haltebogen, Akkord und Löschen behalten ihre
  Beschriftung, ebenso Tempo, Swing, Rückgängig, Wiederholen und Notennamen. Modul 1 bleibt
  beschriftet.
- **Wortmarke** (23.11.2026, Entwurf aus Jonathans Logo-Projekt): ganz links in der oberen
  Leiste, in Modul 1 und der Vollversion, „ferm“, statt des „a“ ein Fermaten-Zeichen in
  `--accent`, „te“; Nunito 800 in `--text`, aus der eigenen Schriftdatei.
- Kein dunkler Modus in Modul 1.

## 3. Architektur

Das Datenmodell ist die einzige Wahrheit. Darstellung, Eingabe und Wiedergabe lesen und
ändern nur das Modell und arbeiten nie direkt miteinander.

```
src/
  model/      Datenmodell, Typen, reine Funktionen (Note setzen, löschen, Takt prüfen)
  modules/    Modul-Konfigurationen (modul1.ts, später voll.ts …)
  render/     Modell → VexFlow (zeichnet nur, enthält keine Logik)
  input/      Touch-/Maus-Ereignisse → Aufrufe der Modell-Funktionen
  playback/   Modell → Tone.js (Zeitplan, mitlaufende Markierung)
  export/     Fermate-Datei, PDF, ZIP, Dateinamen, Teilen
  ui/         Leisten, Dialoge, Startdialog
  storage/    automatisches Speichern im Browser
```

Nach jeder Änderung am Modell wird neu gezeichnet. Die Rückgängig-Funktion speichert
Kopien des Modells (Verlauf von Zuständen).

### 3.1 Datenmodell

Es ist von Anfang an für mehrere Notenzeilen, Instrumente und Lautstärken ausgelegt, auch
wenn Modul 1 nur eine Notenzeile benutzt. Der folgende Stand ist das Zielmodell der Vollversion.

```ts
const TICKS_PER_QUARTER = 48; // Ganze 192, Halbe 96, Viertel 48, Achtel 24, Sechzehntel 12,
                              // punktiert: Halbe 144, Viertel 72, Achtel 36,
                              // Triolen: Viertel 32, Achtel 16

interface Pitch {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'; // wissenschaftliche Notation
  alter: -1 | 0 | 1;                              // Be, ohne, Kreuz
  octave: number;                                 // c' = C4, f'' = F5
}

// Zielmodell der Vollversion (beschlossen 21.11.2026). Seit Schritt 1 der Beta nutzt der
// Code dieses Modell, auch für Modul 1 (Dateiversion 2; Version 1 wird nicht mehr gelesen).
// Noch nicht im Code: `lyric`, `chordSymbols`, `accompaniment` (kommen nach der Beta).
// Im Code heißt `Event` `ScoreEvent` (der Browser hat schon einen Typ `Event`).

// Gespeichert wird der gewählte Wert, die Ticks werden daraus berechnet.
interface Duration {
  base: 192 | 96 | 48 | 24 | 12; // Ganze, Halbe, Viertel, Achtel, Sechzehntel
  dotted: boolean;               // nur bei Halbe, Viertel, Achtel
  triplet: boolean;              // nur bei Viertel und Achtel, nie zusammen mit dotted
}

type Event =
  | { kind: 'note'; pitches: Pitch[]; duration: Duration; tieToNext?: boolean;
      lyric?: string }  // eine Silbe Liedtext (eine Strophe)
    // pitches: von unten nach oben sortiert, ohne doppelte Töne;
    // mehr als ein Ton nur, wenn das Instrument Akkorde erlaubt (Klavier)
  | { kind: 'rest'; duration: Duration; auto: boolean }; // auto = von der App aufgefüllte Lücke

interface Staff {
  id: string;
  clef: 'treble' | 'bass';
  measures: Event[][];
}

interface Part {          // ein Instrument
  id: string;
  instrument: string;     // Schlüssel in der Instrumenten-Tabelle, z. B. 'violin', 'piano'
  staves: Staff[];        // 1 Notenzeile, Klavier 2 (Violin- + Bassschlüssel)
  volume: number;         // 0..1, Lautstärke pro Instrument (Mischpult)
  mute: boolean;
  solo: boolean;
  transposed?: boolean;   // nur Anzeige: transponiert statt klingend (Abschnitt 5)
}

interface Score {
  format: 'fermate';
  version: 2;
  meta: { title: string; names: string[]; className: string };
  moduleId: string;
  timeSignature: { beats: number; beatValue: number }; // Modul 1: 4/4
  keySignature: number;                                // Vorzeichen: -4..4, Modul 1: 0
  pickup: number;                                      // Auftakt in Ticks, 0 = kein Auftakt
  tempo: number;                                       // Viertel pro Minute
  swing: boolean;                                      // nur Wiedergabe, Notenbild bleibt gerade
  parts: Part[];
  chordSymbols: ChordSymbol[];                         // gelten für alle Instrumente
  accompaniment: { volume: number; mute: boolean; solo: boolean }; // Begleitung im Mischpult
}

interface ChordSymbol {
  measure: number;
  tick: number;           // immer auf einer Zählzeit
  root: Pitch['step'];
  alter: -1 | 0 | 1;
  quality: 'major' | 'minor' | '7' | 'm7' | 'maj7' | 'sus4' | 'dim';
}
```

Was zu einem Instrument fest gehört (deutscher Name, Schlüssel, Tonumfang, Klänge, ob Akkorde
erlaubt sind), steht in einer Instrumenten-Tabelle im Code, nicht in der Datei. Dasselbe
Instrument darf mehrmals vorkommen (die App nummeriert: Violine 1, Violine 2), das Klavier nur
einmal. Beim Klavier dürfen Noten frei auf beiden Zeilen stehen (beide mit dem Tonumfang des
Klaviers), beide Zeilen klingen als ein Klavier.

Regeln:

- **Jeder Takt ist im Modell immer vollständig gefüllt.** Was keine Note ist, ist eine Pause
  mit `auto: true` (eine Lücke). In Modul 1 werden Lücken **nicht gezeichnet**, der Platz im
  Takt bleibt leer, und die Takt-Prüfung kennt nur „voll“ (keine Lücke) und „nicht voll“.
  In der Vollversion werden alle Pausen gezeichnet (siehe Abschnitt 5, Eingabe).
- **Noten rücken zusammen** (nur Modul 1, die Vollversion überschreibt): Die Ereignisse eines Takts stehen immer lückenlos ab dem
  Taktanfang, wie Buchstaben in einem Wort. Freier Platz (Lücke) gibt es nur am Taktende.
  So entsteht nie eine Pause, die man hört, aber nicht sieht. Gezielt gesetzte Pausen
  (`auto: false`, in Modul 1 per Link zuschaltbar) sind weitere Ereignisse in dieser Reihe.
- **Notenwerte** (für Noten und Pausen gleich): Ganze bis Sechzehntel, punktiert nur Halbe,
  Viertel und Achtel, Triolen nur als Achteltriolen (3 auf eine Viertel) und Vierteltriolen
  (3 auf eine Halbe). Welche Werte erlaubt sind, legt das Modul fest.
- **Triolengruppen** bestehen nur aus einer Sorte (nie Viertel- und Achteltriolen gemischt),
  Pausen darin sind erlaubt. Eine Gruppe beginnt immer auf einer Zählzeit, nie mitten im Schlag.
  Die Klammer „3“ bestimmt die App selbst aus der Reihenfolge, das Modell speichert keine Gruppe.
- **Taktarten** (Vollversion): 2/4, 3/4, 4/4, 6/8, 2/2. Achtelbalken pro Viertel, im 2/2
  pro Halbe, im 6/8 in zwei Gruppen zu je drei Achteln. Im 6/8 gibt es keine Triolen, gezählt
  werden 2 Schläge (Tempo, Metronom und Einzähler in punktierten Vierteln), Swing ist dort
  ausgeblendet. Im 2/2 zählen Metronom und Einzähler 2 Halbe, Triolen beginnen wie im 4/4
  auf einer Viertel.
- **Notenwert-Leiste und Taktart:** Werte, die in der gewählten Taktart nie in einen Takt
  passen (z. B. Ganze im 3/4, punktierte Halbe im 2/4), blendet die Leiste aus.
- **Haltebögen** (`tieToNext`, Vollversion) verbinden eine Note mit der direkt folgenden Note
  gleicher Tonhöhe, innerhalb eines Takts und über den Taktstrich. Ändert sich die Tonhöhe
  einer verbundenen Note, wandert die andere mit. Folgt keine passende Note mehr (gelöscht,
  überschrieben), verschwindet der Bogen. Die letzte Note des Stücks hat keinen Bogen.
  Verbundene Noten klingen als ein Ton, die mitlaufende Markierung leuchtet über beiden, der
  Notenname steht nur unter der ersten. Wird eine Note über den Taktstrich hinaus verlängert,
  setzt die App selbst einen Bogen in den nächsten Takt (siehe Eingabe der Vollversion).
- Das Modell speichert **immer klingend**. In der Vollversion lassen sich transponierende
  Instrumente transponiert **anzeigen** (Abschnitt 5, „Transponierende Instrumente“, beschlossen
  22.11.2026); Modul 1 und die Voreinstellung bleiben klingend.
- Notennamen in der Oberfläche sind **deutsch**: c d e f g a h, B = H, Be-Vorzeichen auf h
  heißt b. Oktaven: c' … h' = 4. Oktave, c'' … = 5. Oktave.
- Gespeichert wird das Modell als JSON. Die Fermate-Datei hat die Endung `.fermate`
  (JSON-Inhalt mit `format` und `version`, damit spätere Versionen alte Dateien lesen können).

### 3.2 Modul-Konfiguration

Ein Modul ist eine Konfiguration. Die App blendet aus, was das Modul nicht erlaubt, und das
Modell lehnt unerlaubte Eingaben ab. Das Modul wird per Link gewählt
(`…/?modul=1`). Ohne Angabe gilt Modul 1. Mit `&pausen=ja` schaltet die Lehrkraft das
Setzen von Pausen zu (`manualRests: true`); in der App selbst gibt es dafür keinen Schalter.

```ts
const modul1: ModuleConfig = {
  id: '1',
  name: 'Modul 1',
  maxStaves: 1,
  measures: 4,
  timeSignatures: ['4/4'],
  keySignatures: [0],
  durations: [192, 96, 48, 24],   // Ganze, Halbe, Viertel, Achtel
  dotted: false,
  ties: false,
  manualRests: false,             // per Link mit &pausen=ja einschaltbar
  accidentals: [],
  range: { low: 'C4', high: 'F5' }, // c' bis f''
  tempoFixed: 90,
  exportFormats: ['fermate', 'pdf'],
};
```

## 4. Modul 1 (Prototyp): Umfang

**Partitur**
- Beim Start ein Dialog mit Pflichtfeldern **Name(n)** (eine oder mehrere Personen) und
  **Klasse**, Titel optional (bis zu 6 Namensfelder, „+ Weitere Person“). Gespeichert in
  `meta`. Der Startdialog lässt sich nicht wegklicken. „Rückgängig“ betrifft nur Noten, nicht
  die Angaben.
- **Keine Kopfzeile** über den Noten (geändert 22.11.2026, mehr Platz für die Noten). Titel,
  Name(n) und Klasse stehen nur im PDF. Geändert werden sie direkt im **Einstellungsmenü**
  (Zahnrad oben rechts): dort stehen die Felder Name(n), Klasse und Titel wie im Startdialog.
  Jede Änderung gilt sofort; fehlen Name oder Klasse, lässt sich das Menü nicht schließen,
  stattdessen erscheint der Hinweis wie im Startdialog.
- **Einstellungsmenü** in Modul 1: nur die Angaben und unten der Link „Info und
  Lizenzen“, geschlossen mit „Fertig“.
- Eine Notenzeile, Violinschlüssel, C-Dur, 4/4-Takt, genau 4 Takte in einer Zeile,
  Schlussstrich automatisch, keine Taktnummern.
- Button „Neu“ (mit Rückfrage) beginnt eine leere Partitur. Danach erscheint der Startdialog
  mit leeren Feldern (auch Namen und Klasse).

**Noteneingabe** (immer Eingabemodus, kein Umschalten)
- Leiste mit den Notenwerten Ganze, Halbe, Viertel, Achtel. Ein Wert ist immer gewählt.
- Ein Eingabe-Cursor steht hinter der letzten Note des Takts (dort wird angehängt), in einem
  leeren Takt am Taktanfang. Ist der Takt voll, springt er in den nächsten Takt.
- **Noten werden nur dort gesetzt oder geändert, wo der Cursor steht.** Ein Tipp an eine
  andere Stelle setzt nur den Cursor dorthin (ohne Vorschau, ohne Änderung). Stellen sind:
  eine Note (Notenkopf oder ihre Spalte) oder der freie Platz eines Takts; dort wird hinten
  angehängt, egal wie weit rechts getippt wird. Nach dem Setzen steht der Cursor hinter der
  neuen Note, im selben Takt schreibt man also mit einem Tipp pro Note weiter.
- Steht der Cursor im freien Platz, setzt ein Tipp dort die Note. Die Stelle ist beim
  Aufsetzen festgehalten, der Finger kann zur Seite gleiten (damit er die Note nicht verdeckt).
- Eine **Vorschau-Note** folgt der Höhe des Fingers (Linie oder Zwischenraum). Beim Loslassen
  wird die Note gesetzt.
- **Beim Eingeben erklingt kein Ton** (Setzen, Ziehen, Ändern des Notenwerts). Klang gibt es
  in Modul 1 nur über „Abspielen“. Schüler.innen sollen die Noten lesen, nicht nach Gehör
  probieren.
- **Wert ändern:** Wird eine Note kürzer, wird sie in Noten des neuen Werts mit derselben
  Tonhöhe geteilt (Viertel → 2 Achtel, Halbe → 2 Viertel, Ganze → 8 Achtel). Sie behält
  ihren Platz, die folgenden Noten bleiben stehen, der Cursor steht auf der ersten neuen
  Note. Wird sie länger, rücken die folgenden Noten nach rechts (geteilte Noten verschmelzen
  nicht wieder, dafür gibt es „Rückgängig“). Passt danach nicht mehr alles in den Takt,
  ändert sich nichts (keine Haltebögen in Modul 1, es fallen nie Noten weg). Ebenso erscheint keine Vorschau, wenn eine
  neue Note nicht mehr in den Takt passt. Die Leiste graut nichts vorab aus.
- Tonumfang c'–f''. Außerhalb wird keine Vorschau angezeigt. Hilfslinie nur beim c'.
- Steht der Cursor auf einer Note, ist sie ausgewählt (sie erscheint in `--accent`). Ein Tipp
  auf sie oder ihre Spalte ändert die Tonhöhe: sie folgt dem Finger nach oben und unten
  (ohne Ton). Eine ausgewählte Note kann gelöscht werden (die folgenden Noten rücken nach
  links).
- Kommt der Cursor auf eine Note, springt die Notenwert-Leiste auf den Wert der Note. Ein
  anderer Wert in der Leiste ändert die ausgewählte Note (kürzer: teilen, länger: die
  folgenden Noten rücken nach rechts, siehe „Wert ändern“). Das gilt auch nach „Rückgängig“.
- **Pausen** (nur mit `&pausen=ja` im Link, sonst fehlt der Button): Button „Pause“ direkt
  neben den Notenwerten. Er benutzt den gewählten Notenwert: im freien Platz wird eine Pause
  dieses Werts angehängt (Cursor dahinter), steht der Cursor auf einer Note, wird sie zur Pause
  mit demselben Wert. Gesetzte Pausen werden gezeichnet und verhalten sich wie Noten:
  auswählen (orange, „Pause“ erscheint gedrückt), Wert ändern (kürzer: teilen, länger: rücken),
  löschen, Rückgängig. Ein Tipp auf eine ausgewählte Pause macht sie zur Note in Fingerhöhe.
  Gesetzte Pausen füllen den Takt (Takt-Prüfung). Ohne `&pausen=ja` bleiben vorhandene Pausen
  stehen und lassen sich bearbeiten, nur neue gibt es nicht. Unter Pausen stehen keine
  Notennamen.
- Achtel werden automatisch nach Zählzeiten mit Balken verbunden. Eine Achtelpause unterbricht
  den Balken.
- **Takt-Prüfung** mit nur zwei Zuständen, damit Schüler.innen selbst überlegen, was noch
  passt: Unter einem vollen Takt steht ein Häkchen (ohne Text), unter einem nicht vollen Takt
  ein leerer, gestrichelter Kreis. Ein leerer Takt ist ganz leer (keine Ganztaktpause).
- **Rückgängig** (mehrere Schritte), kein Wiederholen.
- Button **Notennamen** zeigt deutsche Notennamen unter den Notenköpfen **nur kurz**: 5 Sekunden
  lang, dabei leert sich die orange Füllung des Buttons als Balken. Danach ist der Button
  30 Sekunden gesperrt, ein heller Balken füllt sich, bis er wieder geht. Grund: Schüler.innen
  sollen nachschauen können, aber nicht dauerhaft nach Buchstaben spielen.

**Wiedergabe**
- Play/Stop-Button, Tempo fest ♩ = 90, Klavierklang.
- Auf dem iPhone klingt die Wiedergabe auch im Stummmodus (`navigator.audioSession.type =
  'playback'`, Safari ab iOS 17), sonst schaltet Safari den Ton stumm.
- Die klingende Note leuchtet auf (mitlaufende Markierung, `Tone.Draw`).
- Lücken klingen als Pausen (Stille). Gesetzte Pausen sind ebenfalls still, die mitlaufende
  Markierung läuft aber über sie.
- Die Wiedergabe endet nach der letzten Note oder gesetzten Pause (leere Takte danach werden
  nicht abgewartet).
  Eine Änderung am Notenbild hält sie an.
- Klavier-Samples: nur c' bis f'' (11 MP3-Dateien) in `public/samples/piano/`, Herkunft und
  Lizenz in `LICENSE.txt` daneben.

**Ansicht**
- Groß und für Touch optimiert (Tippflächen mindestens 44 × 44 pt), Pinch-Zoom. Ausnahme in der
  Vollversion: die beiden Übersichtsleisten sind lange Streifen und dürfen schmaler sein
  (waagrecht 36 px hoch, senkrecht 44 px breit, seit 22.11.2026), „+ Takt“ daneben ist so
  hoch wie die waagrechte Leiste (festgelegt 21.11.2026).
- Querformat auf dem iPad ist der Hauptfall, Hochformat muss benutzbar sein.

**Speichern und Abgabe**
- Automatisches Speichern im Browser nach jeder Änderung, beim Öffnen wird der letzte
  Stand geladen (eigener Speicherplatz pro Modul). Gespeicherte Daten werden vor dem Laden
  geprüft; ungültige werden ignoriert. Ohne `localStorage` läuft die App ohne Speichern.
- Button **Speichern und teilen** (Teilen-Symbol oben rechts, Name geändert 22.11.2026, weil
  „Abgeben“ nicht immer passt; der Vorgang heißt weiter Abgabe): Auswahl der Formate **Fermate-Datei** und
  **PDF** (nichts vorausgewählt, man wählt bewusst). Kein Warnhinweis bei nicht vollen Takten.
  - Dateiname: `[klasse]_[name(n)]_[jjjj-mm-tt]`, z. B. `7a_Mia-Ben_2026-11-11.pdf`.
  - Klasse und Namen kommen aus `meta`, das Datum ist der Tag der Abgabe.
  - Mehrere Namen mit `-` verbinden. Leerzeichen innerhalb eines Namens entfallen
    („Anna Lena“ → „AnnaLena“). ä → ae, ö → oe, ü → ue, ß → ss, Großbuchstaben ebenso.
    Akzente werden weggelassen (é → e), alle anderen Sonderzeichen entfallen.
  - Ein Format gewählt → diese Datei. Beide gewählt → eine ZIP-Datei mit gleichem
    Namensschema (`7a_Mia-Ben_2026-11-11.zip`).
  - Weitergabe über das Teilen-Menü des Geräts (AirDrop usw.), sonst Download. Die Datei
    wird schon beim Öffnen des Dialogs vorbereitet, weil Browser das Teilen-Menü nur direkt
    nach einem Tippen erlauben.
- Das PDF (A4 quer) enthält oben Titel, Name(n), Klasse und Datum, darunter das Notenbild
  (ohne Cursor und Takt-Prüfung).

**Sonstiges**
- Info-Seite mit Lizenzhinweisen (Samples CC BY 3.0, Schriften, verwendete Bibliotheken):
  unauffälliger Link „Info und Lizenzen“ unten im Einstellungsmenü (eine Fußzeile gibt es
  nicht mehr, geändert 22.11.2026), öffnet ein Fenster über der Partitur.
- Läuft als WebApp im Browser (Safari auf dem iPad, dazu Chrome und Firefox am Rechner).
  Eine PWA ist erst für die Vollversion vorgesehen, aber nichts verbauen, was das verhindert.

## 5. Vollversion (in Planung, noch nicht bauen)

Ein eigenes Modul 2 als nächster Schritt entfällt (21.11.2026). Spätere Module entstehen durch
Reduzieren der Vollversion. Aus dem früheren Modul-2-Entwurf gehören in die Vollversion:
Auftakt, Taktnummern, Bildschirmklaviatur, Takt auswählen und kopieren, Wiedergabe ab einer
Stelle, Tempo-Regler, Metronom, Einzähler, Schleife, Mitscrollen, Speichern und Öffnen als
Datei, Teilen per Link, Abgabe zusätzlich als Audio, PWA.

**Beta-Test (beschlossen 21.11.2026):** Zuerst wird ein Kern der Vollversion gebaut und getestet.
Er läuft unter `…/?modul=voll`, ohne Angabe im Link startet weiter Modul 1.
- *In der Beta:* neues Datenmodell, Eingabe mit sichtbaren Pausen und Überschreiben, alle
  Notenwerte, Punktierungen, Triolen, Haltebögen, Taktarten, Tonarten, Kreuz und Be, mehrere
  Instrumente, Klavier mit zwei Zeilen und Akkorden, Wiedergabe mit Tempo-Regler, Mischpult
  (Lautstärke, Stumm, Solo), Rückgängig und Wiederholen, Speichern im Browser, Speichern und
  Öffnen als Datei, Abgabe (Fermate-Datei, PDF).
- *Nach der Beta:* Liedtext, Akkordsymbole mit Begleitung, Audio- und MusicXML-Export, Teilen
  per Link, Metronom, Einzähler, Schleife, Bildschirmklaviatur, Transponieren (des Stücks),
  PWA, Aufgaben der Lehrkraft, Hördiktat.
  „Takt kopieren“ ist seit 22.11.2026 vorgezogen: Markieren (auch über die Taktnummern),
  Kopieren, Einfügen und Löschen gehören jetzt zur Beta (siehe „Eingabe“).
- Alle Punkte vor dem Bauen sind geklärt (21.11.2026); nächster Schritt: Arbeitsschritte der Beta.

**Ansicht (beschlossen 21.11.2026):**
- Auf dem Bildschirm **endlos nach rechts**: jedes Instrument eine durchgehende Notenzeile,
  jeder Takt so breit, wie er braucht. Im PDF Zeilen untereinander auf A4-Seiten.
- Ein **fester Rand links** bleibt stehen und zeigt pro Zeile Kurzname (Fl., Vl. 1, Klav.),
  Schlüssel und Tonart.
- **Gescrollt wird ausschließlich über die Übersichtsleiste** unter den Noten (alle Takte als
  kleine Kästchen, Tippen springt zur Stelle). Wischen mit einem oder zwei Fingern scrollt nicht,
  ein Finger ist immer für die Eingabe da. Automatisch folgt die Ansicht dem Cursor, wenn er aus
  dem Bild wandert, und bei der Wiedergabe (Mitscrollen).
- **Taktnummern:** auf dem Bildschirm klein über jedem Takt, im PDF am Zeilenanfang. Auf dem
  Bildschirm als kleine Knöpfe (abgerundetes Kästchen mit Rahmen, seit 23.11.2026), damit man
  sieht, dass man sie antippen kann; über die Nummern markierte Takte sind hell-orange.
- **Keine Kopfzeile** über den Noten (wie in Modul 1, geändert 22.11.2026); die Angaben
  ändert man im Einstellungsmenü.
- Passen nicht alle Notenzeilen in die Höhe, bleiben die Noten groß, und eine zweite
  **senkrechte Leiste ganz links** springt zu den übrigen Zeilen (geändert 21.11.2026). Seit
  22.11.2026 (erste Testrunde) 44 px breit und wie die waagrechte Leiste mit Inhalt: ein
  Abschnitt pro Instrument (so hoch wie seine Zeilen) mit kleinem Kurznamen, hell-orange
  hinterlegt, wenn es Noten hat, grauer Name, wenn es gerade nicht klingt; dazu der Rahmen für
  den sichtbaren Teil. Der Rand links und die Taktnummern bleiben dabei stehen.
- **Zoom mit Lupen** (geändert 23.11.2026 nach der zweiten Testrunde, zum Ausprobieren): Buttons
  „Kleiner“ und „Größer“ (Lupe − und +) in der oberen Leiste, je ein Viertel kleiner bzw. größer,
  die Mitte des sichtbaren Notenblatts bleibt stehen. Zwei Finger auf dem Notenblatt tun nichts
  mehr (das Pinchen markierte oft versehentlich); kommt ein zweiter Finger dazu, verwirft die
  App, was der erste begonnen hat.
- **Neue Partitur** (neu, geöffnet, aus dem Startassistenten): Die Ansicht beginnt am Anfang.
- **„Datei öffnen“ auf dem iPad** öffnet direkt die Dateien-App, ohne Kamera und
  Fotomediathek: Die Dateiauswahl gibt `.fermate,application/octet-stream` an. Auf dem iPad
  getestet 22.11.2026: ohne Angabe, nur `.fermate` oder `*/*` kommt das Kamera-Menü, mit
  Text/JSON sind `.fermate`-Dateien ausgegraut.
- **Notenblatt füllt die Höhe** (22.11.2026): Das weiße Blatt reicht von der oberen bis zur unteren
  Leiste (keine beigen Streifen darüber und darunter), Noten oben, Übersichtsleiste unten.
- **Lädt …** (22.11.2026): Tippt man auf „Abspielen“, während die Klänge noch laden, zeigt der
  Button „Lädt …“ und die Wiedergabe startet von selbst, sobald sie da sind. Die Klangdateien
  bleiben in 192 kbit/s (verkleinern abgelehnt).
- **Zoom nur für die Noten** (beschlossen 22.11.2026, Teil von Beta-Schritt 10; seit 23.11.2026 mit
  den Lupen statt zwei Fingern, siehe oben): Der Zoom vergrößert oder verkleinert nur das Notenblatt (Noten, Rand links, Taktnummern), von
  halber bis doppelter Normalgröße; die Stelle unter den Fingern bleibt stehen. Leisten und
  Übersichtsleisten bleiben gleich groß, die Seite selbst zoomt dort nicht. Am Rechner: Strg +
  Mausrad bzw. zwei Finger auf dem Trackpad. Die Größe merkt sich das Gerät. Kommt beim Zoomen
  der zweite Finger dazu, verwirft die App, was der erste begonnen hat (keine Note, kein neuer
  Cursor). Modul 1 behält den Zoom des Browsers.

**Startassistent (beschlossen 21.11.2026):** drei kurze Seiten, nicht wegklickbar.
1. *Angaben:* Name(n), Klasse, Titel wie in Modul 1 (Namen und Klasse Pflicht).
2. *Instrumente:* Liste der 13 Instrumente mit „+“, **ohne Voreinstellung** (mindestens ein
   Instrument muss gewählt werden), höchstens 10 (geändert 22.11.2026, vorher 5), Klavier nur
   einmal, gleiche Instrumente werden nummeriert. Schlüssel setzt die App, die Reihenfolge ist
   automatisch die übliche Partiturordnung (Holz, Blech, Klavier, Streicher); umsortieren
   danach im Einstellungsmenü.
3. *Takt und Tonart:* Taktart, Tonart (Dur/Moll bis 4 Vorzeichen), Tempo, Auftakt (an/aus,
   Länge; seit 23.11.2026 unter dem Tempo, das alle brauchen); mit Voreinstellung 4/4, C-Dur,
   kein Auftakt, ♩ = 90.

**Einstellungsmenü (beschlossen 21.11.2026):** nur ein Zahnrad-Symbol oben rechts neben „Neu“
und „Speichern und teilen“ (Name „Einstellungen“ als Tooltip und für Screenreader). Inhalt: oben der Button
die Angaben (Name(n), Klasse, Titel, direkt änderbar wie in Modul 1, geändert 22.11.2026), Instrumente
hinzufügen, entfernen und umsortieren, Tonart (die Töne bleiben
gleich, aus fis in G-Dur wird in C-Dur fis mit Kreuz; Transponieren erst nach der Beta),
Auftakt. Die **Taktart** lässt sich nur ändern, solange die Partitur leer ist, sonst steht dort
ein kurzer Hinweis. Das Tempo steht nicht im Menü, sondern als Regler bei der Wiedergabe.
Rückgängig gilt auch für Änderungen im Einstellungsmenü, nicht aber für die Angaben.
Unten im Einstellungsmenü steht der Link „Info und Lizenzen“; eine Fußzeile gibt es nicht
(mehr Platz für die Noten, geändert 21.11.2026, seit 22.11.2026 auch in Modul 1).
- **Instrumente im Einstellungsmenü** (beschlossen 22.11.2026 nach der ersten Testrunde): Die
  Liste steht in der Reihenfolge der Partitur. Jede Zeile hat „↑“ und „↓“ (beim obersten bzw.
  untersten Instrument ausgegraut) und „Entfernen“. Das Klavier wandert mit beiden Zeilen.
  Notenbild, Mischpult und PDF folgen der Reihenfolge, Rückgängig gilt. Gleiche Instrumente
  werden nach ihrem Platz nummeriert (die obere Violine heißt immer „Violine 1“). Ein neu
  hinzugefügtes Instrument kommt vor das erste Instrument, das in der üblichen Partiturordnung
  später kommt; von dort lässt es sich verschieben. „Entfernen“ fragt **immer** nach („Flöte
  entfernen?“, mit Noten zusätzlich „Die Noten dieses Instruments gehen verloren.“).

**Dateien und PDF (beschlossen 22.11.2026):**
- **Als Datei speichern:** über „Speichern und teilen“ (Teilen-Symbol) mit „Fermate-Datei“, Name
  nach dem Schema der Abgabe (`7a_Mia-Ben_2026-11-22.fermate`), Teilen-Menü oder Download
  (geändert 22.11.2026, vorher ein eigener Punkt unter „+“).
- **Datei öffnen:** über „+“, Dateiauswahl des Geräts. Die Datei wird vollständig geprüft;
  danach Rückfrage „Die aktuelle Partitur wird ersetzt“. Dateien eines anderen Moduls
  (z. B. aus Modul 1) und kaputte Dateien werden mit einem kurzen Hinweis abgelehnt.
  Rückgängig gilt danach erst für neue Änderungen.
- **PDF** der Vollversion: A4 hoch, Kopf (Titel, Name(n), Klasse, Datum) nur auf Seite 1,
  Zeilen untereinander mit Kurznamen, Schlüssel und Tonart in jeder Zeile, Taktnummer am
  Zeilenanfang, Zeilen auf volle Breite gezogen (eine kurze letzte Zeile nicht), Haltebögen über
  das Zeilenende in zwei Hälften, „Seite n von m“ ab zwei Seiten. Modul 1 bleibt A4 quer.
  Eine Zeile, die auf einer Seite nicht Platz hat (viele Instrumente; auf Seite 1 unter dem
  Kopf), wird verkleinert, bis sie passt; keine Seite bleibt ohne Noten (22.11.2026).

**Leisten (beschlossen 21.11.2026):**
- **Oben** (alles, was das ganze Stück betrifft): ganz links die Wortmarke | Abspielen, Tempo,
  Swing, Mischpult | Kleiner, Größer | Rückgängig, Wiederholen, Notennamen | ganz rechts Neu (+), Speichern und teilen, Einstellungen (nur
  Symbole). „+“ öffnet eine Auswahl: Neue Partitur, Datei öffnen (geändert 22.11.2026).
- **Unten** (Schreiben, nah an der Hand): Ganze, Halbe, Viertel, Achtel, Sechzehntel, Punkt,
  Triole | Kreuz, Be, Auflösung | Oktave höher, Oktave tiefer | Haltebogen, Akkord (nur Klavier), Löschen. Notenwerte,
  Vorzeichen, Oktave, Kopieren und Einfügen nur als Zeichen (siehe Gestaltung). „Wiederholen“ bleibt (geprüft 22.11.2026: wer
  einmal zu oft „Rückgängig“ tippt, holt den Schritt zurück).
- **„+ Takt“** am rechten Ende der Übersichtsleiste. Einen eigenen Button „Takt löschen“ gibt es
  nicht mehr (23.11.2026): Takte über die Taktnummern markieren, dann „Löschen“.
- **Tempo:** Button „♩ = 90“ öffnet einen Regler (40 bis 200).
- Im Hochformat dürfen die Leisten in zwei Zeilen umbrechen.
- **Mischpult:** Button „Mischpult“ öffnet ein Fenster über den Noten (wie „Angaben“), eine
  Zeile pro Instrument mit Lautstärkeregler, „Stumm“ und „Solo“, geschlossen mit „Fertig“. Auf
  schmalen Bildschirmen füllt es fast den ganzen Bildschirm. Ein stummes Instrument erkennt man
  am grauen Kurznamen im Rand links.
- **Was klingt** (beschlossen 22.11.2026 nach der ersten Testrunde): Ist bei mindestens einem
  Instrument „Solo“ an, klingen nur die Solo-Instrumente (mehrere zusammen erlaubt); ein
  stummes Instrument klingt nie. „Stumm“ und „Solo“ schließen sich aus: Wer das eine einschaltet,
  schaltet das andere aus. Kurznamen (im Rand links und im Mischpult): grau = klingt gerade
  nicht (stumm oder wegen eines Solos anderer), Solo in `--accent-text`. Die mitlaufende
  Markierung und das Mitscrollen folgen nur klingenden Instrumenten, Änderungen im Mischpult
  wirken auch während der Wiedergabe sofort.

**Eingabe (beschlossen 21.11.2026, anders als in Modul 1):**
- **Immer Eingabemodus**, kein Umschalten in einen eigenen Auswahlmodus (wie in Modul 1).
- **Überall, wo keine Note steht, steht eine Pause**, und alle Pausen werden gezeichnet.
  Ein leerer Takt zeigt eine Ganztaktpause (Ganzepausen-Zeichen in der Taktmitte, in jeder
  Taktart).
- **Pausen entstehen immer automatisch**, es gibt keinen Button „Pause“. Wer eine Pause will,
  löscht eine Note. Die App teilt Pausen selbst nach Zählzeiten auf und ordnet sie nach jeder
  Änderung neu (4/4: Halbe Pause nur auf Schlag 1 oder 3, keine Pause über die Taktmitte;
  6/8: punktierte Viertelpausen pro Halbtakt). Beispiel: Viertel auf Schlag 1 → Viertelpause,
  Halbe Pause.
- **Überschreiben statt Zusammenrücken:** Noten bleiben an ihrer Stelle, nichts rückt nach.
  Eine Note oder Pause antippen wählt sie aus. Ein Wert aus der Leiste ändert ihre Länge
  (ausgewählte Ganztaktpause + Viertel → Viertelpause, Viertelpause, Halbe Pause). Ein Tipp
  auf das Notensystem macht aus der ausgewählten Pause eine Note in Fingerhöhe, danach steht
  der Cursor an der nächsten Stelle.
- **Erst auswählen, dann ändern** (wie in Modul 1): Eine Note ändert sich erst beim zweiten
  Tipp. Landet der Cursor von selbst auf einer Note (beim Öffnen, nach Rückgängig/Wiederholen,
  nach dem Setzen vor einer vorhandenen Note), wählt der nächste Tipp sie nur aus. Auf einer
  Pause, auf die der Cursor nach dem Setzen springt, schreibt ein Tipp gleich weiter.
- **Leiste folgt der Auswahl** (beschlossen 22.11.2026 nach der ersten Testrunde): Tippt man
  eine Note **oder Pause** an, springt die Leiste auf ihren Wert (Achtelpause → Achtel,
  punktierte Viertelpause → Viertel + Punkt, Triolen-Achtelpause → Achtel + Triole). Ein Tipp
  aufs Notensystem macht aus der Pause eine Note gleicher Länge; für einen anderen Wert erst
  den Wert wählen (die Pause wird geteilt), dann tippen. Springt der Cursor **von selbst** auf
  eine Pause (nach dem Setzen, beim Öffnen, nach „+ Takt“, nach Rückgängig/Wiederholen),
  behält die Leiste den Wert, mit dem man gerade schreibt. So schreibt man mit einem Tipp pro
  Note im selben Wert weiter. Auf Noten springt die Leiste immer auf deren Wert.
- **Ganztaktpause angetippt:** Kein Notenwert ist gedrückt (ihr Zeichen ist in jeder Taktart
  gleich). Ein Notenwert teilt sie nach den Regeln (4/4, Achtel → Achtelpause, Achtelpause,
  Viertelpause, Halbe Pause). Ein Tipp aufs Notensystem ohne Wertwahl schreibt eine Note so
  lang wie der Takt (4/4 Ganze, 3/4 und 6/8 punktierte Halbe, 2/4 Halbe). Punkt und Triole
  sind dabei nicht möglich.
- **Punkt und Triole sind keine Dauerschalter** (beschlossen 22.11.2026): Sie wirken wie
  Kreuz und Be auf das Ausgewählte. „Punkt“ punktiert die ausgewählte Note bzw. Pause (auf
  einer Pause: punktierte Pause, der nächste Tipp schreibt eine punktierte Note); nach dem
  Setzen schreibt man wieder ohne Punkt. Auf einer punktierten Note nimmt „Punkt“ den Punkt
  weg. „Triole“ bleibt an, bis die Triolengruppe zu Ende geschrieben ist, und geht dann von
  selbst aus. Ein Notenwert aus der Leiste ist immer ohne Punkt und ohne Triole (beendet also
  auch eine angefangene Triole). Reihenfolge: erst den Wert, dann Punkt bzw. Triole.
- **Kürzer:** Der Rest wird zur Pause. **Länger:** Die Note überschreibt, was folgt; folgende
  Noten können dabei verschwinden („Rückgängig“ holt sie zurück), eine nur teilweise überdeckte
  Note wird zur Pause mit der Restlänge. Reicht die Länge über den Taktstrich, setzt die App
  einen Haltebogen in den nächsten Takt und überschreibt dort ebenso.
- **Löschen:** Die Note wird zur Pause, nichts rückt nach.
- **Triolen beim Überschreiben** (festgelegt mit Schritt 2): Ein normaler Notenwert kann nicht
  mitten in einer Triolengruppe beginnen (es ändert sich nichts), am Anfang der Gruppe
  überschreibt er die ganze Gruppe. Wird eine Gruppe nur teilweise überdeckt, verschwindet sie
  ganz (Rückgängig holt sie zurück). Eine Gruppe ohne Noten verschwindet von selbst.
- **Keine Takt-Prüfung** (jeder Takt ist immer voll).
- **Vorzeichen:** Neue Noten folgen der Tonart (in G-Dur ergibt die f-Linie fis). Buttons
  „Kreuz“, „Be“, „Auflösung“ ändern die ausgewählte Note bzw. den ausgewählten Akkordton
  (Kreuz → fis, Be → fes, Auflösung → f); der Button, der zur Note passt, erscheint gedrückt
  (auch wenn wegen der Tonart kein Zeichen davor steht). Die Buttons wirken nur auf eine
  ausgewählte Note, nie vorab auf die nächste. Tonhöhe ziehen setzt das Vorzeichen zurück, die
  Note folgt wieder der Tonart. Die Zeichen im Notenbild setzt die App selbst: ein Vorzeichen
  gilt bis zum Taktende, danach nötige Auflösungszeichen kommen automatisch, keine
  Hinweis-Vorzeichen im nächsten Takt. Enharmonische Verwechslung erst nach der Beta.
- **Takte:** Eine neue Partitur hat 8 leere Takte, erlaubt sind 1 bis 32. Button „+ Takt“ fügt
  hinter dem Takt mit der Auswahl einen leeren Takt ein (im letzten Takt: anhängen). Takte
  löschen (seit 23.11.2026): einen oder mehrere Takte über die Taktnummern markieren, dann
  „Löschen“; nach der Rückfrage („Takte 2 bis 3 löschen? Die Noten darin gehen in allen
  Instrumenten verloren.“) verschwinden die Takte samt Noten (Rückgängig holt sie zurück).
  Mindestens ein Takt bleibt (mit Auftakt zwei); der Auftakttakt mitgelöscht schaltet den
  Auftakt aus.
  Beides gilt für alle Instrumente. Neue Takte entstehen nie automatisch, auch nicht beim
  Verlängern über den letzten Taktstrich (dann ändert sich nichts).
- **Auftakt:** Länge in Vierteln (im 6/8 in Achteln), gewählt beim Anlegen und nachträglich im
  Einstellungsmenü an- und abwählbar und änderbar. Der letzte Takt wird automatisch um die
  Länge des Auftakts verkürzt, beide ergeben zusammen einen vollen Takt.
  Nachträglich: Einschalten fügt vor Takt 1 einen leeren Auftakttakt ein (keine Note geht
  verloren), Ausschalten entfernt ihn samt Noten. Beim Ändern der Länge bleiben die Noten am
  Ende des Auftakts stehen (länger: vorne Pausen dazu, kürzer: vorne fällt weg, was nicht
  passt). Der letzte Takt wird hinten gekürzt bzw. bekommt hinten Pausen. Rückgängig holt
  Verlorenes zurück.
- Rückgängig und Wiederholen.
- **Markieren, Kopieren, Einfügen, Löschen** (beschlossen 22.11.2026 nach der ersten
  Testrunde, vorgezogen):
  - *Markieren:* Erst eine Note oder Pause antippen (Cursor), dann auf der letzten Stelle den
    Finger etwa eine halbe Sekunde still **halten**: alles dazwischen ist markiert. Liegt die
    letzte Stelle in einer anderen Notenzeile, wird ein Rechteck über alle Zeilen dazwischen
    markiert. Halten auf der Cursor-Stelle bleibt Setzen bzw. Tonhöhe ziehen. Ein Tipp auf eine
    **Taktnummer** markiert den ganzen Takt in allen Instrumenten, Ziehen über mehrere Nummern
    mehrere Takte. Am Rechner zusätzlich Shift + Klick. Eine angeschnittene Triolengruppe wird
    ganz mitmarkiert. Die Markierung ist eine hell-orange Fläche hinter den Noten; ein normaler
    Tipp hebt sie auf. Nach dem Markieren steht der Cursor immer auf der ersten Note bzw. Pause
    der Markierung (in ihrer obersten Zeile; bei Takten über die Nummern in der Zeile des
    Cursors), nie auf der Stelle, auf der man gehalten hat (23.11.2026).
  - *Löschen* mit Markierung: alle markierten Noten werden zu Pausen, nichts rückt nach. Über
    die Taktnummern markierte Takte werden dagegen samt Noten gelöscht (mit Rückfrage, siehe
    „Takte“); eine Markierung mit Halten löscht nur Noten, auch wenn sie ganze Takte umfasst.
  - *Kopieren* (Button in der unteren Leiste bei „Löschen“) merkt sich die markierten Noten
    (bis zum nächsten Kopieren oder Neuladen der Seite).
  - *Einfügen* schreibt ab dem Cursor und überschreibt wie eine lange Note; mehrere Zeilen
    landen ab der Cursor-Zeile nach unten. Nicht mitten in einer Triole. Passt es nicht bis zum
    Ende, hängt die App leere Takte an (Ausnahme von „Takte entstehen nie automatisch“), höchstens
    bis 32 Takte, sonst passiert nichts mit kurzem Hinweis. In ein Instrument ohne Akkorde nur der
    höchste Ton. Töne außerhalb des Tonumfangs werden mit eingefügt und farbig markiert
    (geändert 23.11.2026, Anwendungsfall Kanon: die Flötenmelodie kommt in die Posaune und wird
    dort mit „Oktave tiefer“ versetzt); nur Töne außerhalb der Klaviertastatur verhindern das
    Einfügen mit Hinweis. Rückgängig nimmt alles zurück, auch angehängte Takte.
- **Oktave höher / tiefer** (beschlossen 23.11.2026): zwei Buttons in der unteren Leiste nach
  den Vorzeichen, nur mit dem Zeichen „8va“ und Pfeil nach oben bzw. unten (Name als Tooltip). Sie versetzen das Ausgewählte um eine Oktave: eine Note, einen
  Akkord (ist „Akkord“ gedrückt, nur den ausgewählten Akkordton) oder alle Noten einer
  Markierung (die Markierung bleibt, man kann also mehrmals tippen). Vorzeichen bleiben (fis
  bleibt fis), verbundene Noten wandern mit, Rückgängig gilt. Erlaubt bis zur Klaviertastatur,
  auch über den Tonumfang des Instruments hinaus (dann farbig markiert). Würde auch nur ein
  Ton die Klaviertastatur verlassen, ändert sich nichts, mit kurzem Hinweis (die Melodie
  bleibt zusammen). Auf einer Pause ausgegraut, Pausen in einer Markierung werden
  übersprungen. Mit dem Finger lassen sich weiter nur Töne bis eine Oktave über den Umfang
  hinaus eingeben.
- **Abspielen ab dem Cursor** (beschlossen 22.11.2026): Die Wiedergabe beginnt bei der
  ausgewählten Note oder Pause und läuft bis zum Ende (alle Instrumente). Folgt dort nichts mehr,
  was klingt (gerade fertig geschrieben), beginnt sie am Anfang. Mit einer Markierung spielt sie
  nur den markierten Ausschnitt (nur die markierten Zeilen).

**Transponierende Instrumente (beschlossen 22.11.2026 nach der ersten Testrunde, gebaut
23.11.2026):**
- Das Modell bleibt klingend (Wiedergabe, Tonumfang, Datei unverändert). „Transponiert“ ist nur
  eine Anzeige-Einstellung pro Instrument.
- Schalter im Einstellungsmenü neben dem Instrument, Voreinstellung „klingend“: Klarinette
  „in B“ (große Sekunde höher), Saxofon „in Es“ (große Sexte höher), Trompete „in B“, Horn
  „in F“ (Quinte höher), Kontrabass „Oktave“ (eine Oktave höher). Andere Instrumente haben
  keinen Schalter. Der Schalter ist ein Button mit der Stimmung („in B“), gedrückt =
  transponiert. Umschalten ist ein Rückgängig-Schritt.
- Kurzname zeigt die Stimmung („Klar. (B)“, im Rand zweizeilig; in der senkrechten
  Übersichtsleiste ohne Stimmung, dort ist kein Platz). Die Vorzeichnung wird mittransponiert (C-Dur →
  D-Dur bei der B-Klarinette); entstehen mehr als 4 Vorzeichen, ist das erlaubt, die App wählt
  die Schreibweise mit weniger Vorzeichen (H-Dur statt Ces-Dur, Des-Dur statt Cis-Dur; bei
  sechs Vorzeichen bleibt Fis-Dur). Doppelkreuze und Doppel-Be gibt es nicht: Bräuchte ein Ton
  beim Umrechnen eins, nimmt die App den gleich klingenden Ton (beschlossen 23.11.2026, z. B.
  fes bei der B-Klarinette wird klingend d, im Notenbild steht dann e).
- Eingabe, Ziehen und Vorzeichen-Buttons arbeiten im angezeigten (gegriffenen) Bild, die App
  rechnet um. „Notennamen“ zeigt die gegriffenen Namen.
- Das PDF zeigt jedes Instrument so, wie es eingestellt ist.

**Weitere Funktionen (Entwurf):**
- Bis zu 10 Instrumente (geändert 22.11.2026, vorher 5), jedes mit eigener Notenzeile, das
  Klavier mit zwei Zeilen (höchstens 11 Zeilen). Kurzer Assistent beim Anlegen: Instrumente wählen, Klavier nur einmal.
- Instrumente: Flöte, Klarinette, Fagott, Saxofon, Trompete, Horn, Posaune, Tuba, Violine,
  Viola, Violoncello, Kontrabass, Klavier. Samples aus *tonejs-instruments*. Viola ohne eigene
  Samples: tief aus Cello-, hoch aus Violinen-Samples. Nur die verwendeten Instrumente laden.
- Schlüssel automatisch nach Instrument: Violin- oder Bassschlüssel. Die Viola wird im
  Violinschlüssel notiert, weitere Schlüssel gibt es nicht.
- Tonumfang pro Instrument, Noten außerhalb farbig markiert (in `--accent-text`, Variable
  `--out-of-range`). Eingeben lassen sich Töne bis eine Oktave über den Umfang hinaus.
  Der Umfang ist, was Schüler.innen üblicherweise spielen können (festgelegt 22.11.2026,
  klingend, Jonathan passt bei Bedarf an): Flöte c'–g''', Klarinette d–b'', Saxofon (Alt,
  Name bleibt „Saxofon“) des–f'', Fagott B₁–g', Trompete b–f'', Horn c–c'', Posaune E–f',
  Tuba F₁–b, Violine g–d''', Viola c–f'', Violoncello C–g', Kontrabass E₁–d, Klavier ganze
  Tastatur.
- Eine Stimme pro Notenzeile, Akkorde nur beim Klavier.
- **Akkorde eingeben** (beschlossen 21.11.2026): Button „Akkord“, nur beim Klavier sichtbar.
  Ist er gedrückt, fügt ein Tipp in Fingerhöhe dem ausgewählten Akkord einen Ton hinzu, statt
  die Note zu verschieben. Ein Tipp auf einen Notenkopf wählt diesen einen Ton aus: Ziehen
  verschiebt nur ihn, Löschen entfernt nur ihn (der letzte Ton → Pause). Ein Notenwert gilt
  immer für den ganzen Akkord. Ein Haltebogen gehört zum ganzen Akkord und verbindet alle
  Töne, die im nächsten Akkord ebenfalls vorkommen; einzelne Töne bindet man nicht von Hand.
  Notennamen stehen untereinander, der tiefste unten.
- **Lautstärke pro Instrument** (Kernfunktion, das Klavier hat einen Regler), Stumm/Solo.
- **Liedtext** (beschlossen 21.11.2026): eine Strophe, bei jedem Instrument möglich, eine Silbe
  pro Note (bei Akkorden für den ganzen Akkord). Eingabe wie in Sibelius: Note auswählen,
  Button „Text“, Eingabefeld unter der Note; Leerzeichen springt zur nächsten Note, Bindestrich
  ebenso und zeichnet einen Trennstrich. Pausen und die zweite Note eines Haltebogens werden
  übersprungen. Keine Haltelinie bei Silben über mehrere Noten. Tonhöhe oder Wert ändern behält
  die Silbe, Löschen oder Überschreiben entfernt sie. Notennamen stehen zwischen Notenzeile
  und Liedtext.
- **Akkordsymbole** (beschlossen 21.11.2026): gehören zum Stück (Takt + Zählzeit), nicht zu
  einer Note, und stehen über der obersten Notenzeile; nur auf Zählzeiten (im 6/8 zwei pro
  Takt). Grundton mit Kreuz/Be, Arten Dur, Moll, 7, m7, maj7, sus4, vermindert. Deutsche
  Schreibweise mit H (H7, B = h-Be), Moll als „Am“. Eingabe: Button „Akkordsymbol“ öffnet eine
  Auswahl (Grundton, Vorzeichen, Art), gesetzt an der Zählzeit der ausgewählten Note oder Pause.
  **Begleitung:** liegende Akkorde mit Klavierklang in mittlerer Lage, ein Akkord klingt bis zum
  nächsten Symbol, die Begleitung endet mit der letzten Note. Im Mischpult eine eigene Zeile
  „Begleitung“ (Lautstärke, Stumm, Solo), keine eigene Notenzeile, zählt nicht zu den
  10 Instrumenten.
- **Swing-Achtel:** Gerade notierte Achtel klingen lang–kurz (etwa 2:1). Beschlossen
  22.11.2026 nach der ersten Testrunde: eigener Button „Swing“ in der oberen Leiste neben dem
  Tempo (gedrückt = an, im 6/8 ausgegraut), ein Tipp schaltet um; wie beim Tempo kein
  Rückgängig-Schritt, die Wiedergabe hält an. Es swingen nur zwei einfache Achtel (Noten oder
  Pausen) auf einer Viertel; Sechzehntel, Punktierungen und Triolen bleiben. Ist Swing an,
  steht im PDF über der ersten Zeile am Anfang „♫ = ♩³♪“; auf dem Bildschirm reicht der
  gedrückte Button (geändert 23.11.2026).
- Notenwerte Ganze bis Sechzehntel, punktierte Halbe, Viertel und Achtel, Achtel- und
  Vierteltriolen, alle auch als Pausen (siehe 3.1).
- Dur und Moll bis 4 Vorzeichen, 6/8 und 2/2, Auflösungszeichen,
  Transponieren, Tempoangabe im Notentext.
- Export: Fermate-Datei, PDF, Audio, MusicXML. Abgabe mit frei wählbaren Formaten.
- Aufgaben der Lehrkraft (Melodieanfang vorgeben, Noten sperren) und Hördiktat
  (Melodie hören ohne Notenbild, mitschreiben, vergleichen).
- PWA, offline nutzbar, Klänge zwischengespeichert.

## 6. Ausdrücklich ausgeschlossen (in keinem Modul)

Dynamik, Artikulation (auch Bindebögen), Verzierungen, Agogik (Ritardando, Fermate als Zeichen; der Name der App ist davon unberührt),
Generalbass, Panorama/Hall/Effekte, mehrere Stimmen in einer Notenzeile,
Schlüssel-/Tonart-/Taktartwechsel im Stück, Wiederholungszeichen, weitere Schlüssel
(Alt, Tenor), MIDI-Keyboard (Safari auf iOS hat kein Web MIDI),
Echtzeit-Einspielen, MIDI-Export, Konten, Server, Mailversand.

## 7. Arbeitsschritte für Modul 1

1. **Gerüst:** Vite + TypeScript, Ordnerstruktur, Vitest, Deployment auf GitHub Pages.
   Eine leere Seite ist online erreichbar.
2. **Datenmodell:** Typen, Modul-1-Konfiguration, reine Funktionen (Note setzen mit
   Überschreiben, löschen, Tonhöhe ändern, Takt-Prüfung, automatische Pausen) mit Tests.
3. **Darstellung:** Modell → VexFlow, 4 Takte, automatische Balken, Takt-Prüfung, Notennamen.
4. **Eingabe:** Notenwert-Leiste, Cursor, Vorschau-Note, Setzen, Auswählen, Ziehen, Löschen,
   Rückgängig. Zuerst mit Maus testen, dann auf dem iPad.
5. **Wiedergabe:** Klavier-Sampler, Play/Stop, mitlaufende Markierung (kein Ton beim Setzen).
6. **Startdialog und Speichern:** Pflichtfelder, automatisches Speichern, „Neu“.
7. **Abgabe:** Dateinamen (mit Tests), Fermate-Datei, PDF, ZIP, Teilen.
8. **Feinschliff auf dem iPad:** Tippflächen, Zoom, Querformat und Hochformat, Info-Seite.

Nach Schritt 8 wird Modul 1 im Unterricht getestet. Danach geht es mit der Vollversion weiter (Abschnitt 5).

## 8. Arbeitsschritte für die Beta der Vollversion

Gleiche Arbeitsweise wie in Abschnitt 7: nach jedem Schritt lauffähig, ein Commit pro Schritt,
Tests für die Programmlogik. **Modul 1 muss nach jedem Schritt unverändert funktionieren**
(ohne Angabe im Link startet weiter Modul 1). Die Beta läuft unter `…/?modul=voll`.

1. **Datenmodell umstellen:** `Duration`, `pitches`, `Part`, `pickup` wie in 3.1. Modul 1 läuft
   auf dem neuen Modell, alle bisherigen Tests bleiben grün. Neue Modul-Konfiguration `voll`
   mit Einstellungen für die Unterschiede (Pausen sichtbar, Überschreiben statt Zusammenrücken).
   `?modul=voll` zeigt eine leere Klavier-Partitur.
2. **Eingaberegeln im Modell:** automatische Pausen nach Zählzeiten für alle Taktarten,
   Überschreiben, kürzer/länger, Löschen → Pause, Punkt, Triolen (Gruppen), Haltebögen
   (auch automatisch über den Taktstrich), Vorzeichen nach Tonart, Takte einfügen/löschen,
   Auftakt. Nur reine Funktionen mit Tests, noch ohne Oberfläche.
3. **Darstellung:** sichtbare Pausen und Ganztaktpause, alle Notenwerte, Punkte,
   Triolenklammern, Haltebögen, Balken je Taktart, Tonart und Vorzeichen (gültig bis Taktende),
   Taktnummern; endlos waagrecht mit festem Rand links. Zunächst ein Instrument.
4. **Eingabe:** untere Leiste (Notenwerte, Punkt, Triole, Kreuz, Be, Auflösung, Haltebogen,
   Löschen), obere Leiste (Rückgängig, Wiederholen, Notennamen), Auswählen von Noten und Pausen,
   Tonhöhe setzen und ziehen. Erst mit Maus, dann auf dem iPad.
5. **Übersichtsleiste:** waagrecht, Mitlaufen mit dem Cursor und der Wiedergabe, „+ Takt“ und
   „Takt löschen“. (Die senkrechte Leiste kommt mit Schritt 6, erst dann gibt es mehrere
   Notenzeilen.)
6. **Mehrere Instrumente:** Instrumenten-Tabelle (13 Instrumente), Partiturordnung, Klavier mit
   zwei Zeilen, senkrechte Übersichtsleiste, Akkorde (Button „Akkord“, einzelne Töne auswählen), Tonumfang farbig markiert.
7. **Klänge und Wiedergabe:** Samples aller Instrumente (nur benötigte Dateien, nur verwendete
   Instrumente laden, Viola aus Cello- und Violinen-Samples), Lizenzhinweise, Abspielen mit
   mitlaufender Markierung und Mitscrollen, Tempo-Regler, Mischpult.
8. **Startassistent, Einstellungen und Speichern:** drei Seiten Startassistent,
   Einstellungsmenü (Instrumente, Tonart, Taktart bei leerer Partitur, Auftakt), automatisches
   Speichern im Browser (eigener Speicherplatz), „Neu“.
9. **Dateien und Abgabe:** als Datei speichern und öffnen, Abgabe mit Fermate-Datei und PDF
   (Zeilen untereinander auf A4-Seiten, mehrere Instrumente, Taktnummern am Zeilenanfang).
10. **Feinschliff auf dem iPad:** Zoom nur für die Noten (zwei Finger), Tippflächen, Querformat und
    Hochformat, Ladezeiten der Klänge.

Nach Schritt 10 beginnt der Beta-Test.
