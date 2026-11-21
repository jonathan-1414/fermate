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
| Klänge | Klavier-Samples aus *tonejs-instruments* (nbrosowsky), nur die benötigten MP3-Dateien nach `public/samples/piano/` kopieren. Lizenz CC BY 3.0 → Namensnennung auf einer Info-Seite |
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
  Ausnahme: die Buttons „Neu“ (+) und „Abgeben“ (Teilen-Symbol) zeigen nur ein
  gezeichnetes SVG-Symbol und stehen immer ganz oben rechts (Name als
  Tooltip und für Screenreader).
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

// Zielmodell der Vollversion (beschlossen 21.11.2026). Der Code von Modul 1 nutzt noch
// `ticks` (+ `dotted?`), `pitch` statt `pitches` und `staves` ohne `Part`; er wird mit der
// Vollversion umgestellt. Es gibt noch keine gespeicherten Dateien oder Stände aus dem
// Unterricht, eine Umwandlung alter Daten ist daher nicht nötig.

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
}

interface Score {
  format: 'fermate';
  version: 1;
  meta: { title: string; names: string[]; className: string };
  moduleId: string;
  timeSignature: { beats: number; beatValue: number }; // Modul 1: 4/4
  keySignature: number;                                // Vorzeichen: -4..4, Modul 1: 0
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
- Notiert wird **immer klingend**, transponierende Instrumente gibt es im Notenbild nicht.
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
- **Kopfzeile** über dem Notensystem wie auf gedruckten Noten: Titel in der Mitte, Name(n)
  und Klasse rechts (wo sonst Komponist.innen stehen), dahinter ein kleines Stift-Symbol.
  Ein Tipp auf die Kopfzeile öffnet den Dialog „Angaben“ zum Ändern. Einen eigenen Button
  dafür gibt es nicht. So sieht man jederzeit, wessen Partitur das ist.
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
- Groß und für Touch optimiert (Tippflächen mindestens 44 × 44 pt), Pinch-Zoom.
- Querformat auf dem iPad ist der Hauptfall, Hochformat muss benutzbar sein.

**Speichern und Abgabe**
- Automatisches Speichern im Browser nach jeder Änderung, beim Öffnen wird der letzte
  Stand geladen (eigener Speicherplatz pro Modul). Gespeicherte Daten werden vor dem Laden
  geprüft; ungültige werden ignoriert. Ohne `localStorage` läuft die App ohne Speichern.
- Button **Abgeben** (Teilen-Symbol oben rechts): Auswahl der Formate **Fermate-Datei** und
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
  unauffälliger Link „Info und Lizenzen“ unten rechts, öffnet ein Fenster über der Partitur.
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
  per Link, Metronom, Einzähler, Schleife, Bildschirmklaviatur, Transponieren, Takt kopieren,
  PWA, Aufgaben der Lehrkraft, Hördiktat.
- *Vor dem Bauen noch zu klären:* Vorzeichen eingeben, Anzahl der Takte, Ansicht (endlos
  waagrecht oder Zeilen untereinander), Startassistent, Anordnung der Leiste.

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
- **Kürzer:** Der Rest wird zur Pause. **Länger:** Die Note überschreibt, was folgt; folgende
  Noten können dabei verschwinden („Rückgängig“ holt sie zurück), eine nur teilweise überdeckte
  Note wird zur Pause mit der Restlänge. Reicht die Länge über den Taktstrich, setzt die App
  einen Haltebogen in den nächsten Takt und überschreibt dort ebenso.
- **Löschen:** Die Note wird zur Pause, nichts rückt nach.
- **Keine Takt-Prüfung** (jeder Takt ist immer voll).
- Rückgängig und Wiederholen.

**Weitere Funktionen (Entwurf):**
- Bis zu 5 Instrumente, jedes mit eigener Notenzeile, das Klavier mit zwei Zeilen
  (höchstens 6 Zeilen). Kurzer Assistent beim Anlegen: Instrumente wählen, Klavier nur einmal.
- Instrumente: Flöte, Klarinette, Fagott, Saxofon, Trompete, Horn, Posaune, Tuba, Violine,
  Viola, Violoncello, Kontrabass, Klavier. Samples aus *tonejs-instruments*. Viola ohne eigene
  Samples: tief aus Cello-, hoch aus Violinen-Samples. Nur die verwendeten Instrumente laden.
- Schlüssel automatisch nach Instrument: Violin- oder Bassschlüssel. Die Viola wird im
  Violinschlüssel notiert, weitere Schlüssel gibt es nicht.
- Tonumfang pro Instrument, Noten außerhalb farbig markiert.
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
  5 Instrumenten.
- **Swing-Achtel:** Gerade notierte Achtel klingen lang–kurz (etwa 2:1).
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
(Alt, Tenor), transponierte Notation, MIDI-Keyboard (Safari auf iOS hat kein Web MIDI),
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
