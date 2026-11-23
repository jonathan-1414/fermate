import { createWordmark } from './wordmark';
import { inKey } from '../model/accidentals';
import { octaveAt, octaveRange, stepAt, stepRange } from '../model/octave';
import { setTransposed, shownTransposition, staffKeys, toSounding, toWritten } from '../model/transpose';
import { plain } from '../model/duration';
import { History } from '../model/history';
import { isCompound } from '../model/meter';
import { isMetaComplete } from '../model/meta';
import {
  addChordTone,
  removeChordTone,
  changeNoteDuration,
  changeNotePitch,
  fitsTimeSignature,
  isAllowedDuration,
  isOnRest,
  restPreview,
  setAccidental,
  setTie,
  writeNoteAt,
} from '../model/overwrite';
import { pitchAtStaffPosition, pitchToMidi } from '../model/pitch';
import { completeStaves, entryRange, instrumentById, partNames } from '../model/instruments';
import { createEmptyScore } from '../model/score';
import { eventAtPosition, nextPosition, positionAtTick } from '../model/sequence';
import { allStaves, partOfStaff, staffAt } from '../model/staves';
import type { BaseValue, Duration, Pitch, Position, Score, ScoreEvent } from '../model/types';
import { soundingParts } from '../model/mix';
import {
  type Clip,
  copyRange,
  deleteRange,
  fromAbsolute,
  measureRange,
  pasteClip,
  type Range,
  rangeBetween,
  rangeHasNotes,
  toAbsolute,
} from '../model/range';
import { isWholeMeasureRest, leftTripletGroup, valueAfterWriting } from '../model/value';
import type { EditError, EditResult } from '../model/edit';
import type { ModuleConfig } from '../modules/types';
import { hitTest, staffPositionAt } from '../input/hitTest';
import { attachScoreInput } from '../input/scoreInput';
import { MAX_ZOOM, MIN_ZOOM, renderFullScore, setDrawingZoom, ZOOM, type FullLayout, type StaffLayout } from '../render/renderFull';
import { clampZoom, scrollAfterZoom, zoomForWheel } from '../input/zoom';
import { loadZoom, saveZoom } from '../storage/zoom';
import { createPlayer } from '../playback/player';
import { buildSchedule, playbackStart } from '../playback/schedule';
import { loadScore, saveScore } from '../storage/autosave';
import { baseFileName } from '../export/filename';
import { buildHandIn } from '../export/handIn';
import { canShareFile, shareOrDownload } from '../export/share';
import { askForMeta, askHandIn, confirm, showInfo, showMessage, showScoreMenu } from './dialogs';
import { readFermateFile, type ReadError } from '../export/fermateFile';
import { createTimedReveal } from './timedReveal';
import { createFullToolbar } from './toolbarFull';
import { showMixer, showTempo } from './mixer';
import { askInstruments, askMeter, showSettings, type MeterChoice } from './setup';
import { createConfiguredScore } from '../model/setup';
import { addPart, movePart, removePart } from '../model/instruments';
import { deleteMeasures, insertMeasure, setKeySignature, setPickup, setTimeSignature } from '../model/measures';
import { createOverview, createVerticalOverview } from './overview';

const NOTE_NAMES_SHOW_MS = 5000;
const NOTE_NAMES_LOCK_MS = 30000;

const READ_ERRORS: Record<ReadError, string> = {
  unreadable: 'Diese Datei lässt sich nicht öffnen. Sie ist keine Fermate-Datei oder beschädigt.',
  'other-module': 'Diese Datei wurde in einem anderen Modul von Fermate geschrieben und lässt sich hier nicht öffnen.',
};

/** Holding a finger still this long on another place marks up to there. */
const HOLD_MS = 500;

/** Why "Einfügen" did nothing (other reasons need no message). */
const PASTE_ERRORS: Partial<Record<EditError, string>> = {
  'too-many-measures': 'Zu lang: Ein Stück hat höchstens 32 Takte.',
  'not-enough-staves': 'Darunter sind nicht genug Notenzeilen für alles, was kopiert wurde.',
  'out-of-range': 'Einige Töne liegen außerhalb der Klaviertastatur.',
  'inside-triplet': 'Mitten in einer Triole lässt sich nichts einfügen.',
  'triplet-position': 'Hier lässt sich nichts einfügen: Eine Triole muss auf einer Zählzeit beginnen.',
};

const OCTAVE_LIMIT = {
  1: 'Höher geht es nicht: Einige Töne lägen über der Klaviertastatur.',
  [-1]: 'Tiefer geht es nicht: Einige Töne lägen unter der Klaviertastatur.',
} as const;

interface Snapshot {
  score: Score;
  cursor: Position;
}

type Gesture =
  | { kind: 'place'; before: Snapshot }
  | { kind: 'drag'; before: Snapshot; changed: boolean }
  /** Akkord pressed: a tap adds a tone at the finger to the selected note. */
  | { kind: 'chord'; before: Snapshot; pitch: Pitch | null };

/**
 * The app of the full version (…/?modul=voll). Input as described in CLAUDE.md,
 * section 5: the cursor always stands on a note or rest (shown selected); a value
 * chosen on a rest shows how the rest is split; a second tap on the selected rest
 * sets a note there (it overwrites), on a selected note it changes the pitch.
 */
export function startFullApp(root: HTMLElement, module: ModuleConfig): void {
  root.innerHTML = `
    <header class="toolbar"></header>
    <main class="score-area full"><div class="sheet"><div class="score-frame"><div id="score"></div><div></div></div></div></main>
    <div class="toolbar toolbar-bottom"></div>
  `;
  const scoreElement = root.querySelector<HTMLDivElement>('#score')!;
  /** Abspielen was tapped while the samples were still loading. */
  let loadingSound = false;
  /** Size of the music (screen pixels per drawing unit), changed with two fingers; kept on the device. */
  /** One tap on Lupe + or Lupe −: the music a quarter larger or smaller. */
  const ZOOM_STEP = 1.25;
  let zoom = clampZoom(loadZoom() ?? ZOOM, MIN_ZOOM, MAX_ZOOM);
  let beforeDown: {
    cursor: Position;
    selectedByTap: boolean;
    tone: number;
    duration: Duration;
    noValueAt: Position | null;
    dotOnce: boolean;
    marked: Range | null;
  } | null = null;
  /** How far the music is scrolled to the right (screen pixels). Only the overview bar scrolls it. */
  let scrollX = 0;
  /** How far the music is scrolled down (screen pixels), by the vertical overview bar only. */
  let scrollY = 0;
  const verticalOverview = createVerticalOverview(root.querySelector<HTMLElement>('.score-frame > div:last-child')!, (center) => {
    const body = scoreBody();
    if (!body) return;
    scrollY = center * body.scrollHeight - body.clientHeight / 2;
    applyScroll();
  });
  let lastCursorKey = '';
  let lastPlayingKey = '';
  const overview = createOverview(root.querySelector('.sheet')!, {
    scrollTo(center) {
      const sc = scroller();
      if (!sc) return;
      scrollX = center * sc.scrollWidth - sc.clientWidth / 2;
      applyScroll();
    },
    insertMeasure() {
      // An empty measure after the one with the cursor; the cursor goes into it.
      if (!commit(insertMeasure(score, module, cursor.measure))) return;
      cursor = { staff: cursor.staff, measure: cursor.measure + 1, tick: 0 };
      selectedByTap = false;
      render();
    },
  });

  // A score saved in an earlier beta step may lack a staff (piano with one staff): add it.
  const loaded = loadScore(module);
  let score = loaded ? completeStaves(loaded, module) : createEmptyScore(module);
  let savedScore: Score | null = score;
  let cursor: Position = { staff: 0, measure: 0, tick: 0 };
  /**
   * Was the note at the cursor selected by a tap? Only then does the next tap change it
   * (first tap: select, second tap: change). When the cursor lands on a note by itself
   * (opening, undo, after setting a note in front of it), the next tap only selects it.
   */
  let selectedByTap = false;
  /** In a chord: the selected tone (0 = lowest). A value, a tie apply to the whole chord. */
  let tone = 0;
  /** "Akkord" pressed: a tap on the selected note adds a tone. */
  let chordMode = false;
  /** The value to write with (the bottom toolbar shows it). */
  let duration: Duration = plain(48);
  /**
   * A whole-measure rest tapped here: no value is shown; a tap writes a note as long as
   * the measure (`duration` holds that length). Ends as soon as the cursor moves.
   */
  let noValueAt: Position | null = null;
  /** The dot was chosen with "Punkt" on a rest: it counts for the next note only. */
  let dotOnce = false;
  /** Several notes marked (hold, Shift + click, measure numbers); null = none. */
  let marked: Range | null = null;
  /** The marking was made on the measure numbers: "Löschen" then removes the measures. */
  let byNumbers = false;
  /** What "Kopieren" took (until the next copy or reloading the page). */
  let clipboard: Clip | null = null;
  /** A finger rests on another place: after HOLD_MS it marks from `from` up to there. */
  let hold: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
  let showNoteNames = false;
  let preview: { at: Position; pitch: Pitch } | null = null;
  let gesture: Gesture | null = null;
  let layout: FullLayout | null = null;
  const history = new History<Snapshot>();

  /**
   * The notes sounding right now (all staves, as the player reports them). Only those of
   * instruments that can be heard are marked and followed (see audible()).
   */
  let soundingList: Position[] = [];
  let playingList: Position[] = [];
  let playing: Position | null = null;
  let playedScore: Score | null = null;
  const player = createPlayer({
    onLoaded() {
      if (!loadingSound) return;
      loadingSound = false;
      render();
    },
    onSounding(list) {
      if (list.length > 0 && !playedScore) return;
      soundingList = list;
      render();
    },
    onEnd() {
      soundingList = [];
      playedScore = null;
      render();
    },
  });
  for (const type of ['pointerdown', 'pointerup', 'keydown'] as const) {
    document.addEventListener(type, () => player.unlock(), { capture: true });
  }

  /** The note the cursor stands on, or null (on a rest). */
  function selectedNote() {
    const event = eventAtPosition(score, cursor);
    return event?.kind === 'note' ? event : null;
  }

  /** Keeps an edit (with undo) if it worked; otherwise nothing changes. */
  function commit(result: EditResult): boolean {
    if (!result.ok) return false;
    history.push({ score, cursor });
    score = result.score;
    marked = null; // the notes changed: the marking would no longer fit them
    return true;
  }

  /** A new value: on a note it changes the note, on a rest it is the value of the next note. */
  function applyDuration(d: Duration): boolean {
    if (!isAllowedDuration(module, score.timeSignature, d)) return false;
    if (selectedNote()) {
      if (!commit(changeNoteDuration(score, module, cursor, d))) return false;
    }
    duration = d;
    noValueAt = null;
    dotOnce = false;
    render();
    return true;
  }

  /** Is a whole-measure rest selected by a tap (no value shown)? */
  function noValue(): boolean {
    return noValueAt !== null && samePosition(noValueAt, cursor);
  }

  /**
   * After a tap moved the cursor: the toolbar takes the value of the selected note or of
   * the rest as it was drawn; on a whole-measure rest no value is shown.
   */
  function takeValueOfSelection(drawn: ScoreEvent | null): void {
    noValueAt = null;
    dotOnce = false;
    const note = selectedNote();
    if (note) {
      duration = note.duration;
    } else if (isWholeMeasureRest(score, cursor)) {
      duration = eventAtPosition(score, cursor)!.duration;
      noValueAt = cursor;
    } else if (drawn?.kind === 'rest') {
      duration = drawn.duration;
    }
  }

  // "Datei öffnen": the device's own file picker. Tested on the iPad (22.11.2026): with
  // ".fermate" plus "any data" Safari opens "Dateien" directly (no camera, no photo
  // library) and .fermate files can be chosen; without a filter or with ".fermate" alone
  // the camera menu comes, with text/JSON the .fermate files are greyed out.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.fermate,application/octet-stream';
  fileInput.hidden = true;
  root.append(fileInput);
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // the same file can be chosen again
    if (file) void openFile(file);
  });

  // The word mark first, at the top left; the toolbar adds its buttons after it.
  root.querySelector('header.toolbar')!.prepend(createWordmark());
  const toolbar = createFullToolbar(root.querySelector('header.toolbar')!, root.querySelector('.toolbar-bottom')!, {
    zoomIn() {
      zoomStep(ZOOM_STEP);
    },
    zoomOut() {
      zoomStep(1 / ZOOM_STEP);
    },
    togglePlay() {
      if (player.isPlaying() || playedScore) {
        player.stop();
        playedScore = null;
        render();
        return;
      }
      // A marking plays only itself; otherwise from the cursor (or from the start, see playbackStart).
      const section = marked
        ? { from: marked.from, to: marked.to, firstStaff: marked.firstStaff, lastStaff: marked.lastStaff }
        : { from: playbackStart(score, toAbsolute(score, cursor.measure, cursor.tick)), to: Infinity };
      const schedule = buildSchedule(score, section);
      if (schedule.notes.length === 0) return;
      playedScore = score;
      loadingSound = true; // until the samples are there ("Lädt …")
      render();
      void player.play(schedule, mixOf(score));
    },
    openTempo() {
      const unit = tempoUnit();
      showTempo(unit.glyph, Math.round(score.tempo / unit.factor), (beats) => {
        score = { ...score, tempo: beats * unit.factor };
        render();
      });
    },
    toggleSwing() {
      // Like the tempo: no undo step; it stops playback (play again to hear it).
      if (isCompound(score.timeSignature)) return;
      score = { ...score, swing: !score.swing };
      render();
    },
    openMixer() {
      const names = partNames(score);
      showMixer(
        score.parts.map((part, i) => ({ name: names[i], volume: part.volume, mute: part.mute, solo: part.solo })),
        (mix) => {
          const wasPlaying = playedScore !== null;
          const parts = score.parts.map((part, i) => ({ ...part, volume: mix[i].volume, mute: mix[i].mute, solo: mix[i].solo }));
          score = { ...score, parts };
          if (wasPlaying) playedScore = score; // the mixer works while playing, it does not stop
          player.setMix(mixOf(score));
          render();
        },
      );
    },
    undo() {
      const previous = history.undo({ score, cursor });
      if (!previous) return;
      restore(previous);
    },
    redo() {
      const next = history.redo({ score, cursor });
      if (!next) return;
      restore(next);
    },
    showNoteNames() {
      noteNames.start();
    },
    openScoreMenu() {
      showScoreMenu({
        newScore: () => void newScore(),
        open: () => fileInput.click(),
      });
    },
    openSettings() {
      showSettings(module, {
        score: () => score,
        setMeta(meta) {
          score = { ...score, meta };
          render();
        },
        showInfo,
        addInstrument(id) {
          if (commit(addPart(score, module, id))) render();
        },
        async removeInstrument(index) {
          const part = score.parts[index];
          const hasNotes = part.staves.some((s) => s.measures.some((m) => m.some((e) => e.kind === 'note')));
          const name = partNames(score)[index];
          // Always asked (a wrong "Violine 1" is easily tapped); undo brings it back.
          const question = hasNotes ? `${name} entfernen? Die Noten dieses Instruments gehen verloren.` : `${name} entfernen?`;
          if (!(await confirm(question, 'Entfernen'))) return;
          if (commit(removePart(score, index))) {
            checkCursor();
            render();
          }
        },
        moveInstrument(index, direction) {
          // The cursor stays on its staff, wherever that goes.
          const staffId = allStaves(score)[cursor.staff]?.id;
          if (!commit(movePart(score, index, direction))) return;
          const staff = allStaves(score).findIndex((s) => s.id === staffId);
          if (staff >= 0) cursor = { ...cursor, staff };
          render();
        },
        setTransposed(index, on) {
          if (commit(setTransposed(score, index, on))) render();
        },
        setKey(key) {
          if (commit(setKeySignature(score, module, key))) render();
        },
        setTimeSignature(text) {
          if (commit(setTimeSignature(score, module, text))) {
            checkCursor();
            render();
          }
        },
        setPickup(ticks) {
          if (commit(setPickup(score, module, ticks))) {
            checkCursor();
            render();
          }
        },
      });
    },
    handIn() {
      player.stop();
      const date = new Date();
      const handedIn = score;
      void askHandIn({
        fileName: (formats) => `${baseFileName(handedIn.meta, date)}.${formats.length > 1 ? 'zip' : formats[0]}`,
        prepare: (formats) => buildHandIn(handedIn, formats, date),
        canShare: canShareFile,
        deliver: shareOrDownload,
      });
    },
    selectBase(base: BaseValue) {
      // A value from the toolbar is always without dot and triplet.
      applyDuration(plain(base));
    },
    toggleDot() {
      // Works on what is selected; on a rest the dot counts for the next note only.
      if (noValue()) return;
      const onRest = !selectedNote();
      const next = { ...duration, dotted: !duration.dotted, triplet: false };
      if (applyDuration(next) && onRest && next.dotted) dotOnce = true;
    },
    toggleTriplet() {
      // Stays on until the triplet group is written (see the end of a tap).
      if (noValue()) return;
      applyDuration({ ...duration, triplet: !duration.triplet, dotted: false });
    },
    setAccidental(alter) {
      const pitch = selectedPitch();
      const part = partOfStaff(score, cursor.staff);
      if (!pitch) return;
      // The buttons work on the note as shown: on a transposed staff the written note gets
      // the sign, the app converts (a double flat sounding becomes the same sound, e.g. d).
      const sounding = toSounding({ ...toWritten(pitch, part, score.keySignature), alter }, part, score.keySignature);
      const result = shownTransposition(part)
        ? changeNotePitch(score, module, cursor, sounding, tone)
        : setAccidental(score, module, cursor, alter, tone);
      if (commit(result)) {
        followTone(sounding.step, sounding.octave, sounding.alter);
        render();
      }
    },
    octave(direction) {
      moveNotes(direction, octaveAt, octaveRange);
    },
    step(direction) {
      moveNotes(direction, stepAt, stepRange);
    },
    toggleTie() {
      const note = selectedNote();
      if (note && commit(setTie(score, module, cursor, !note.tieToNext))) render();
    },
    copy() {
      if (!marked) return;
      clipboard = copyRange(score, marked) ?? clipboard;
      render();
    },
    paste() {
      if (!clipboard) return;
      const result = pasteClip(score, module, cursor, clipboard);
      if (!result.ok) {
        const message = PASTE_ERRORS[result.error];
        if (message) void showMessage(message);
        return;
      }
      commit(result);
      checkCursor();
      // On a note the toolbar always shows its value (the cursor now stands on the pasted notes).
      duration = selectedNote()?.duration ?? duration;
      dotOnce = false;
      render();
    },
    toggleChord() {
      chordMode = !chordMode;
      render();
    },
    deleteSelection() {
      // Measures marked on their numbers: the measures go, after asking (23.11.2026).
      if (marked && byNumbers) {
        void deleteMarkedMeasures(marked);
        return;
      }
      // A marking: all its notes become rests (the marking stays to be seen).
      if (marked) {
        const kept = marked;
        if (commit(deleteRange(score, kept))) {
          marked = kept;
          render();
        }
        return;
      }
      // In a chord only the selected tone goes; a single note becomes rest.
      if (!commit(removeChordTone(score, cursor, tone))) return;
      tone = Math.max(0, tone - 1);
      render();
    },
  });

  function restore(snapshot: Snapshot): void {
    // Undo and redo are for the notes only: the details (names, class, title) stay.
    score = { ...snapshot.score, meta: score.meta };
    cursor = snapshot.cursor;
    selectedByTap = false;
    tone = 0;
    marked = null;
    // On a note the toolbar shows its value; on a rest it keeps the value to write with.
    duration = selectedNote()?.duration ?? duration;
    noValueAt = null;
    dotOnce = false;
    render();
  }

  const noteNames = createTimedReveal(NOTE_NAMES_SHOW_MS, NOTE_NAMES_LOCK_MS, (phase, ms) => {
    showNoteNames = phase === 'showing';
    toolbar.setNoteNamesPhase(phase, ms);
    render();
  });

  /** A score from the start (new, opened, from the wizard): cursor and view at the beginning. */
  function resetCursor(): void {
    cursor = { staff: 0, measure: 0, tick: 0 };
    selectedByTap = false;
    tone = 0;
    chordMode = false;
    noValueAt = null;
    marked = null;
    scrollX = 0;
    scrollY = 0;
  }

  /** After instruments or measures changed: the cursor must still stand on something. */
  function checkCursor(): void {
    const staves = allStaves(score);
    const staff = Math.min(cursor.staff, staves.length - 1);
    const measure = Math.min(cursor.measure, staves[staff].measures.length - 1);
    const at = { staff, measure, tick: cursor.tick };
    cursor = eventAtPosition(score, at) || isOnRest(score, at) ? at : { staff, measure, tick: 0 };
    selectedByTap = false;
    tone = 0;
    noValueAt = null;
  }

  async function newScore(): Promise<void> {
    const yes = await confirm('Neue Partitur beginnen? Alle Noten dieser Partitur werden gelöscht.', 'Neu beginnen');
    if (!yes) return;
    player.stop();
    // Everything starts empty, also names, class and title; then the start wizard.
    score = createEmptyScore(module);
    resetCursor();
    history.clear();
    render();
    await runWizard();
  }

  /** Opens a Fermate file: checked first, then it replaces the score (after asking). */
  async function openFile(file: File): Promise<void> {
    const result = readFermateFile(new Uint8Array(await file.arrayBuffer()), module);
    if (!result.ok) {
      await showMessage(READ_ERRORS[result.error]);
      return;
    }
    const yes = await confirm('Datei öffnen? Die aktuelle Partitur wird ersetzt.', 'Öffnen');
    if (!yes) return;
    player.stop();
    playedScore = null;
    score = result.score;
    resetCursor();
    history.clear();
    render();
    if (!isMetaComplete(score.meta)) {
      score = { ...score, meta: await askForMeta(score.meta) };
      render();
    }
  }

  /**
   * The start wizard: details (names, class, title), instruments, then time signature,
   * key, pickup and tempo. It cannot be cancelled; "Zurück" goes to the page before.
   */
  async function runWizard(): Promise<void> {
    let meta = score.meta;
    let instruments: string[] = [];
    let meter: MeterChoice = { timeSignature: module.timeSignatures[0], keySignature: 0, pickup: 0, tempo: 90 };
    let page = 1;
    for (;;) {
      if (page === 1) {
        meta = await askForMeta(meta);
        page = 2;
      } else if (page === 2) {
        const chosen = await askInstruments(instruments, module.maxParts);
        if (chosen === 'back') page = 1;
        else {
          instruments = chosen;
          page = 3;
        }
      } else {
        const chosen = await askMeter(module, meter);
        if (chosen === 'back') {
          page = 2;
          continue;
        }
        meter = chosen;
        const result = createConfiguredScore(module, { instruments, ...meter });
        if (!result.ok) {
          page = 2;
          continue;
        }
        score = { ...result.score, meta };
        resetCursor();
        history.clear();
        render();
        return;
      }
    }
  }

  /** The positions of instruments that can be heard (not muted, solo rules). */
  function audible(list: Position[]): Position[] {
    const sounding = soundingParts(score.parts);
    return list.filter((at) => {
      const part = partOfStaff(score, at.staff);
      return part !== undefined && sounding[score.parts.indexOf(part)];
    });
  }

  /** How the parts sound (mixer settings). */
  function mixOf(s: Score) {
    return s.parts.map((part) => ({ instrument: part.instrument, volume: part.volume, mute: part.mute, solo: part.solo }));
  }

  /** The selected tone of the selected note (in a chord: one of its tones). */
  function selectedPitch(): Pitch | null {
    const note = selectedNote();
    if (!note) return null;
    tone = Math.min(tone, note.pitches.length - 1);
    return note.pitches[tone];
  }

  /** The selected tone as it is shown (written on a transposed staff). */
  function shownPitch(): Pitch | null {
    const pitch = selectedPitch();
    return pitch && toWritten(pitch, partOfStaff(score, cursor.staff), score.keySignature);
  }

  /** After a change the tones are sorted again: find the selected tone by its pitch. */
  function followTone(step: Pitch['step'] | undefined, octave: number | undefined, alter: number): void {
    const index = selectedNote()?.pitches.findIndex((p) => p.step === step && p.octave === octave && p.alter === alter) ?? -1;
    if (index >= 0) tone = index;
  }

  /** What is drawn: the score, with the preview note, the preview chord tone or the split rest. */
  function shownScore(): Score {
    if (gesture?.kind === 'chord' && gesture.pitch) {
      const result = addChordTone(score, module, cursor, gesture.pitch);
      if (result.ok) return result.score;
    }
    if (preview) {
      const result = writeNoteAt(score, module, preview.at, [preview.pitch], duration);
      if (result.ok) return result.score;
    }
    if (!playedScore && isOnRest(score, cursor)) return restPreview(score, module, cursor, duration) ?? score;
    return score;
  }

  function render(): void {
    if (score !== savedScore) {
      saveScore(module, score);
      savedScore = score;
    }
    if (playedScore && playedScore !== score) {
      playedScore = null;
      player.stop();
    }
    // Only what can be heard is marked; the view follows its first note.
    playingList = audible(soundingList);
    playing = playingList[0] ?? null;
    const shown = shownScore();
    const quiet = preview !== null || playedScore !== null;
    // The cursor shows as the selected note or rest; where no event starts at the cursor
    // (a value longer than the rests up to the next note), as a line.
    const cursorIsEvent = eventAtPosition(shown, cursor) !== null;
    layout = renderFullScore(scoreElement, shown, {
      showNoteNames,
      cursor: quiet || cursorIsEvent ? null : cursor,
      selection: quiet ? null : cursor,
      preview: preview?.at ?? null,
      playing,
      showRests: true,
      measureCheck: false,
      selectedTone: tone,
      playingList,
      zoom,
      markedMeasures:
        marked && byNumbers ? { first: fromAbsolute(score, marked.from).measure, last: fromAbsolute(score, marked.to - 1).measure } : null,
      marked: marked && {
        firstStaff: marked.firstStaff,
        lastStaff: marked.lastStaff,
        from: fromAbsolute(score, marked.from),
        to: fromAbsolute(score, marked.to),
      },
    });
    player.prepare(score.parts.map((part) => part.instrument));
    fitHeight();
    followView();
    const ts = score.timeSignature;
    const note = selectedNote();
    const fits = (d: Duration) => isAllowedDuration(module, ts, d) && fitsTimeSignature(ts, d);
    const none = noValue();
    toolbar.update({
      duration: none ? null : duration,
      bases: (module.durations as BaseValue[]).filter((base) => fits(plain(base))),
      canDot: !none && fits({ base: duration.base, dotted: true, triplet: false }),
      tripletsShown: module.triplets && !isCompound(ts),
      canTriplet: !none && fits({ base: duration.base, dotted: false, triplet: true }),
      // As shown: on a transposed staff the written note's sign.
      alter: note ? (shownPitch()?.alter ?? null) : null,
      tie: note && module.ties ? note.tieToNext === true : null,
      chordShown: chordsOn(cursor.staff),
      chordMode,
      canDelete: note !== null || (marked !== null && (byNumbers || rangeHasNotes(score, marked))),
      canCopy: marked !== null && rangeHasNotes(score, marked),
      canOctave: note !== null || (marked !== null && rangeHasNotes(score, marked)),
      canPaste: clipboard !== null,
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      playing: playedScore !== null,
      loading: loadingSound && playedScore !== null,
      tempoGlyph: tempoUnit().glyph,
      tempo: Math.round(score.tempo / tempoUnit().factor),
      swing: score.swing,
      canSwing: !isCompound(ts),
      canZoomIn: zoom < MAX_ZOOM - 0.001,
      canZoomOut: zoom > MIN_ZOOM + 0.001,
    });
  }

  /**
   * The beat the tempo is counted in: quarter, in 2/2 half, in 6/8 dotted quarter.
   * The score keeps the tempo in quarters per minute; `factor` converts.
   */
  function tempoUnit(): { glyph: string; factor: number } {
    const ts = score.timeSignature;
    if (isCompound(ts)) return { glyph: '\uE1D5\uE1E7', factor: 1.5 };
    if (ts.beatValue === 2) return { glyph: '\uE1D3', factor: 2 };
    return { glyph: '\uE1D5', factor: 1 };
  }

  /** "Takt löschen" works while more measures remain than the minimum (a pickup can always go). */
  /**
   * "Ton" or "Oktave" höher/tiefer: a marking moves all its notes (the marking stays, so it
   * can be moved again), otherwise the selected note (with "Akkord" only the selected tone).
   */
  function moveNotes(
    direction: 1 | -1,
    atCursor: typeof octaveAt,
    inMarking: typeof octaveRange,
  ): void {
    const kept = marked;
    const keptByNumbers = byNumbers;
    const before = selectedNote();
    const result = kept ? inMarking(score, module, kept, direction) : atCursor(score, module, cursor, direction, chordMode ? tone : null);
    if (!result.ok) {
      if (result.error === 'out-of-range') void showMessage(OCTAVE_LIMIT[direction]);
      return;
    }
    const index = tone;
    commit(result);
    marked = kept;
    byNumbers = keptByNumbers;
    // The moved chord tone stays selected (the tones are sorted again).
    if (!kept && chordMode && before) {
      const moved = selectedNote()?.pitches.findIndex((p) => !before.pitches.some((q) => samePitch(p, q))) ?? -1;
      tone = moved >= 0 ? moved : index;
    }
    render();
  }

  /** "Löschen" on measures marked on their numbers: asks, then the measures go in all instruments. */
  async function deleteMarkedMeasures(range: Range): Promise<void> {
    const first = fromAbsolute(score, range.from).measure;
    const last = fromAbsolute(score, range.to - 1).measure;
    const number = (m: number) => (score.pickup > 0 ? m : m + 1);
    const name = (m: number) => (number(m) === 0 ? 'Auftakt' : `Takt ${number(m)}`);
    // "Takt 3 löschen?", "Takte 3 bis 5 löschen?", "Auftakt bis Takt 2 löschen?"
    const question =
      first === last
        ? `${name(first)} löschen?`
        : number(first) === 0
          ? `Auftakt bis ${name(last)} löschen?`
          : `Takte ${number(first)} bis ${number(last)} löschen?`;
    const yes = await confirm(`${question} Die Noten darin gehen in allen Instrumenten verloren.`, 'Löschen');
    if (!yes) return;
    if (!commit(deleteMeasures(score, module, first, last))) {
      void showMessage('So viele Takte lassen sich nicht löschen: Ein Stück braucht mindestens einen Takt.');
      return;
    }
    const count = staffAt(score, cursor.staff)!.measures.length;
    cursor = { staff: cursor.staff, measure: Math.min(first, count - 1), tick: 0 };
    selectedByTap = false;
    noValueAt = null;
    render();
  }

  function scroller(): HTMLElement | null {
    return scoreElement.querySelector<HTMLElement>('.score-scroller');
  }

  function scoreBody(): HTMLElement | null {
    return scoreElement.querySelector<HTMLElement>('.score-body');
  }

  function chordsOn(staff: number): boolean {
    return instrumentById(partOfStaff(score, staff)?.instrument ?? '')?.chords === true;
  }

  /**
   * The music gets the height that is left on the screen; if not all staves fit,
   * the vertical overview bar appears and the notes stay large.
   */
  function fitHeight(): void {
    const body = scoreBody();
    if (!body) return;
    body.style.maxHeight = 'none';
    // Measured with the sheet as high as its content (not stretched to the toolbars).
    root.classList.add('measuring');
    const page = document.documentElement.scrollHeight;
    // Empty room around the sheet (it sits in the middle of the area) is free as well.
    const area = root.querySelector<HTMLElement>('.score-area');
    const sheet = root.querySelector<HTMLElement>('.sheet');
    const slack = area && sheet ? Math.max(0, area.clientHeight - 32 - sheet.offsetHeight) : 0;
    const free = window.innerHeight - (page - body.offsetHeight) + slack - 4;
    root.classList.remove('measuring');
    body.style.maxHeight = `${Math.max(Math.round(130 * zoom), free)}px`;
  }

  /** Puts the music at the remembered scroll position and moves the frames in the overviews. */
  function applyScroll(): void {
    const sc = scroller();
    const body = scoreBody();
    if (!sc || !body) return;
    scrollX = Math.min(Math.max(0, scrollX), Math.max(0, sc.scrollWidth - sc.clientWidth));
    sc.scrollLeft = scrollX;
    const numbers = scoreElement.querySelector<HTMLElement>('.score-numbers');
    if (numbers) numbers.scrollLeft = scrollX;
    overview.setView(scrollX / sc.scrollWidth, sc.clientWidth / sc.scrollWidth);
    scrollY = Math.min(Math.max(0, scrollY), Math.max(0, body.scrollHeight - body.clientHeight));
    body.scrollTop = scrollY;
    verticalOverview.setView(scrollY / body.scrollHeight, body.clientHeight / body.scrollHeight);
  }

  /** Scrolls just enough that this measure (of this staff) is on the screen. */
  function showMeasure(measure: number, staff: number): void {
    const sc = scroller();
    const body = scoreBody();
    const band = layout?.staves[staff];
    const box = band?.measures[measure];
    if (!sc || !body || !band || !box) return;
    const left = box.x * zoom;
    const right = (box.x + box.width) * zoom;
    if (left < scrollX) scrollX = left - 24;
    else if (right > scrollX + sc.clientWidth) scrollX = Math.min(left - 24, right - sc.clientWidth + 24);
    const top = band.top * zoom;
    const bottom = band.bottom * zoom;
    if (top < scrollY) scrollY = top;
    else if (bottom > scrollY + body.clientHeight) scrollY = Math.min(top, bottom - body.clientHeight);
  }

  /**
   * After drawing: the view keeps its place; it follows the cursor when the cursor moved
   * (also out of the screen after setting a note) and the sounding note during playback.
   */
  function followView(): void {
    const cursorKey = `${cursor.staff}/${cursor.measure}/${cursor.tick}`;
    if (cursorKey !== lastCursorKey) showMeasure(cursor.measure, cursor.staff);
    lastCursorKey = cursorKey;
    const playingKey = playing ? `${playing.measure}/${playing.tick}` : '';
    if (playing && playingKey !== lastPlayingKey) showMeasure(playing.measure, playing.staff);
    lastPlayingKey = playingKey;
    applyScroll();

    const measures = layout?.staves[0]?.measures ?? [];
    const total = measures.reduce((sum, m) => sum + m.width, 0) || 1;
    const staves = allStaves(score);
    const count = staves[0].measures.length;
    overview.update({
      measures: measures.map((m, i) => {
        const number = score.pickup > 0 ? i : i + 1;
        return {
          share: m.width / total,
          number: number >= 1 ? number : null,
          hasNotes: staves.some((staff) => staff.measures[i]?.some((e) => e.kind === 'note')),
        };
      }),
      viewStart: 0,
      viewWidth: 1,
      cursorMeasure: cursor.measure,
      canInsert: count < module.maxMeasures,
    });
    // Vertical bar on the left, only when not all staves fit into the height.
    const body = scoreBody();
    // One box per instrument, as high as its staves (with the room up to the next one).
    const bands = layout?.staves ?? [];
    const height = layout?.height || 1;
    // The narrow bar has no room for the tuning ("Kb. (Oktave)"): it stands in the margin.
    const shortNames = partNames(score, true).map((name) => name.replace(/ \(.*\)$/, ''));
    const sounding = soundingParts(score.parts);
    let firstStaff = 0;
    const parts = score.parts.map((part, p) => {
      const top = p === 0 ? 0 : (bands[firstStaff]?.top ?? 0);
      firstStaff += part.staves.length;
      const bottom = firstStaff < bands.length ? bands[firstStaff].top : height;
      return {
        name: shortNames[p],
        share: (bottom - top) / height,
        hasNotes: part.staves.some((staff) => staff.measures.some((m) => m.some((e) => e.kind === 'note'))),
        sounding: sounding[p],
      };
    });
    verticalOverview.update({
      parts,
      viewStart: 0,
      viewHeight: 1,
      visible: body !== null && body.scrollHeight > body.clientHeight + 1,
    });
    applyScroll(); // the frames again, after the boxes were drawn
  }

  /** The staff band under this height (or the nearest one). */
  function staffLayoutAt(y: number): StaffLayout | null {
    const staves = layout?.staves ?? [];
    return staves.find((s) => y >= s.top && y < s.bottom) ?? null;
  }

  const samePosition = (a: Position, b: Position) => a.staff === b.staff && a.measure === b.measure && a.tick === b.tick;

  /**
   * Pitch under the finger on the cursor's staff as the key makes it (new notes follow
   * the key), or null outside what can be entered for this instrument.
   */
  function pitchAt(y: number): Pitch | null {
    const band = layout?.staves[cursor.staff];
    if (!band) return null;
    const clef = staffAt(score, cursor.staff)!.clef;
    const part = partOfStaff(score, cursor.staff);
    // On a transposed staff the finger points at a written note (in the written key).
    const shown = inKey(pitchAtStaffPosition(clef, staffPositionAt(band, y)), staffKeys(score)[cursor.staff]);
    const pitch = toSounding(shown, part, score.keySignature);
    const range = entryRange(module, part);
    const midi = pitchToMidi(pitch);
    return midi >= range.low && midi <= range.high ? pitch : null;
  }

  const samePitch = (a: Pitch | null, b: Pitch | null) =>
    a === b || (a !== null && b !== null && a.step === b.step && a.octave === b.octave && a.alter === b.alter);

  /** Moves the selected note (in a chord: the selected tone) to the finger; tied notes move along. */
  function dragTo(drag: Extract<Gesture, { kind: 'drag' }>, y: number): boolean {
    const pitch = pitchAt(y);
    if (!pitch || samePitch(pitch, selectedPitch())) return false;
    const result = changeNotePitch(score, module, cursor, pitch, tone);
    if (!result.ok) return false;
    score = result.score;
    followTone(pitch.step, pitch.octave, pitch.alter);
    drag.changed = true;
    return true;
  }

  /** The preview note under the finger, if a note of the chosen value can be set there. */
  function previewAt(y: number): { at: Position; pitch: Pitch } | null {
    const pitch = pitchAt(y);
    if (!pitch || !writeNoteAt(score, module, cursor, [pitch], duration).ok) return null;
    return { at: cursor, pitch };
  }

  function endHold(): void {
    if (hold) clearTimeout(hold.timer);
    hold = null;
  }

  /** A place inside a rest (a split rest as drawn) counts from the start of that rest. */
  function markablePosition(spot: Position): Position {
    if (eventAtPosition(score, spot)) return spot;
    return positionAtTick(score, spot.staff, spot.measure, spot.tick) ?? spot;
  }

  // The measure numbers: a tap marks the measure in all staves, dragging several.
  let numbersFrom: number | null = null;
  /**
   * A new marking: the cursor goes to its first note or rest (on the marking's top staff,
   * or for whole measures on the cursor's staff), so that the end of the marking is never
   * the selected note (23.11.2026). The toolbar shows the value of what is selected there.
   */
  function mark(range: Range, staff = range.firstStaff): void {
    marked = range;
    byNumbers = false;
    const at = fromAbsolute(score, range.from);
    cursor = { staff, ...at };
    selectedByTap = false;
    tone = 0;
    takeValueOfSelection(eventAtPosition(shownScore(), cursor));
  }

  const measureAtX = (clientX: number): number | null => {
    const svg = scoreElement.querySelector<SVGSVGElement>('.score-numbers svg');
    const matrix = svg?.getScreenCTM();
    const boxes = layout?.staves[0]?.measures ?? [];
    if (!matrix || boxes.length === 0) return null;
    const x = new DOMPoint(clientX, 0).matrixTransform(matrix.inverse()).x;
    const index = boxes.findIndex((b) => x >= b.x && x < b.x + b.width);
    return index >= 0 ? index : x < boxes[0].x ? 0 : boxes.length - 1;
  };
  scoreElement.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('.score-numbers')) return;
    const measure = measureAtX(event.clientX);
    if (measure === null) return;
    numbersFrom = measure;
    mark(measureRange(score, measure, measure), cursor.staff);
    byNumbers = true;
    render();
  });
  scoreElement.addEventListener('pointermove', (event) => {
    if (numbersFrom === null) return;
    const measure = measureAtX(event.clientX);
    if (measure === null) return;
    const next = measureRange(score, numbersFrom, measure);
    if (marked && next.from === marked.from && next.to === marked.to) return;
    mark(next, cursor.staff);
    byNumbers = true;
    render();
  });
  for (const type of ['pointerup', 'pointercancel'] as const) {
    scoreElement.addEventListener(type, () => (numbersFrom = null));
  }

  attachScoreInput(scoreElement, {
    down(x, y, shift) {
      // Remembered in case a second finger follows (zooming must not move the cursor).
      beforeDown = { cursor, selectedByTap, tone, duration, noValueAt, dotOnce, marked };
      const band = staffLayoutAt(y);
      if (!band) return;
      const hit = hitTest(band, x, y);
      if (!hit) return;
      endHold();
      const before = { score, cursor };
      // The spot under the finger, as drawn (a split rest counts with its parts).
      let spot: Position = { staff: band.index, measure: hit.measure, tick: hit.noteTick ?? hit.columnTick };
      if (eventAtPosition(score, spot) === null && !isOnRest(score, spot)) {
        spot = positionAtTick(score, band.index, hit.measure, spot.tick) ?? spot;
      }
      // A tap on a note head of a chord means that tone.
      const heads = hit.noteTick !== null ? band.measures[hit.measure].events.find((e) => e.tick === hit.noteTick)?.ys : undefined;
      const tappedTone =
        heads && heads.length > 1 ? heads.reduce((best, h, k) => (Math.abs(h - y) < Math.abs(heads[best] - y) ? k : best), 0) : null;

      // The first tap on a spot (or on another tone of the chord) only selects it; on a
      // note, the toolbar shows its value. A note is changed only by a second tap on it.
      const otherTone = tappedTone !== null && tappedTone !== tone && !chordMode;
      // Shift + click (computer): mark from the cursor up to here.
      if (shift && (eventAtPosition(score, spot) || isOnRest(score, spot))) {
        mark(rangeBetween(score, cursor, markablePosition(spot)));
        render();
        return;
      }
      marked = null; // a normal tap ends a marking
      if (!samePosition(spot, cursor) || (selectedNote() && !selectedByTap) || otherTone) {
        const drawn = eventAtPosition(shownScore(), spot);
        const from = cursor;
        cursor = spot;
        selectedByTap = true;
        tone = tappedTone ?? 0;
        takeValueOfSelection(drawn);
        // Held still on this other place: everything from the old cursor up to here is marked.
        if (!samePosition(from, spot)) {
          hold = {
            x,
            y,
            timer: setTimeout(() => {
              hold = null;
              mark(rangeBetween(score, from, markablePosition(spot)));
              render();
            }, HOLD_MS),
          };
        }
        render();
        return;
      }
      if (selectedNote() && chordMode && chordsOn(cursor.staff)) {
        gesture = { kind: 'chord', before, pitch: pitchAt(y) };
      } else if (selectedNote()) {
        gesture = { kind: 'drag', before, changed: false };
        dragTo(gesture, y);
      } else {
        gesture = { kind: 'place', before };
        preview = previewAt(y);
      }
      render();
    },

    move(x, y) {
      // Moving the finger is not holding still.
      if (hold && Math.hypot(x - hold.x, y - hold.y) > 8) endHold();
      if (!gesture) return;
      if (gesture.kind === 'chord') {
        const pitch = pitchAt(y);
        if (samePitch(pitch, gesture.pitch)) return;
        gesture.pitch = pitch;
        render();
        return;
      }
      if (gesture.kind === 'place') {
        const next = previewAt(y);
        if (samePitch(next?.pitch ?? null, preview?.pitch ?? null)) return;
        preview = next;
        render();
        return;
      }
      if (dragTo(gesture, y)) render();
    },

    up() {
      beforeDown = null;
      endHold();
      const done = gesture;
      gesture = null;
      if (done?.kind === 'place' && preview) {
        const result = writeNoteAt(score, module, preview.at, [preview.pitch], duration);
        if (result.ok) {
          history.push(done.before);
          score = result.score;
          cursor = nextPosition(score, preview.at);
          selectedByTap = false; // on a rest: the next tap writes; on a note: it only selects
          // On a rest the toolbar keeps the value written with (a dot from "Punkt" and
          // a finished triplet group end here); on a note it shows the note's value.
          duration =
            selectedNote()?.duration ??
            valueAfterWriting(duration, dotOnce, leftTripletGroup(score, preview.at, cursor));
          noValueAt = null;
          dotOnce = false;
        }
      }
      if (done?.kind === 'drag' && done.changed) history.push(done.before);
      if (done?.kind === 'chord' && done.pitch) {
        const added = done.pitch;
        if (commit(addChordTone(score, module, cursor, added))) followTone(added.step, added.octave, added.alter);
      }
      preview = null;
      render();
    },

    cancel() {
      endHold();
      if (gesture?.kind === 'drag' && gesture.changed) score = gesture.before.score;
      gesture = null;
      preview = null;
      render();
    },
  }, {
    // Two fingers on the music do nothing (23.11.2026: pinching often marked by mistake;
    // zoom is now "Lupe +" and "Lupe −"). What the first finger began is undone.
    start() {
      if (beforeDown) {
        ({ cursor, selectedByTap, tone, duration, noValueAt, dotOnce, marked } = beforeDown);
        endHold();
        beforeDown = null;
        render();
      }
    },
    change() {},
    end() {},
  });

  // Ctrl + mouse wheel, or two fingers on a trackpad: the same on a computer.
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;
  scoreElement.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault(); // not the whole page
      zoomTo(zoomForWheel(zoom, event.deltaY), event.clientX, event.clientY);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        saveZoom(zoom);
        render();
      }, 200);
    },
    { passive: false },
  );
  // Safari zooms the page with its own gesture events: not on the music.
  for (const type of ['gesturestart', 'gesturechange']) {
    scoreElement.addEventListener(type, (event) => event.preventDefault());
  }

  /**
   * Lupe + / Lupe −: one step larger or smaller; the middle of the visible music stays in
   * its place (the view then follows the cursor if it left the picture).
   */
  function zoomStep(factor: number): void {
    const sc = scroller();
    if (!sc) return;
    const view = sc.getBoundingClientRect();
    zoomTo(zoom * factor, view.left + view.width / 2, view.top + view.height / 2);
    saveZoom(zoom);
    render();
  }

  /**
   * Sets a new size for the music at once (without drawing it again); the point at
   * (clientX, clientY) stays in its place.
   */
  function zoomTo(wanted: number, clientX: number, clientY: number): void {
    const next = clampZoom(wanted, MIN_ZOOM, MAX_ZOOM);
    const sc = scroller();
    const body = scoreBody();
    if (!Number.isFinite(next) || next === zoom || !sc || !body) return;
    const view = sc.getBoundingClientRect();
    const height = body.getBoundingClientRect();
    scrollX = scrollAfterZoom(scrollX, clientX - view.left, zoom, next);
    scrollY = scrollAfterZoom(scrollY, clientY - height.top, zoom, next);
    zoom = next;
    setDrawingZoom(scoreElement, zoom);
    fitHeight();
    applyScroll();
  }

  // A turned iPad (portrait / landscape) has another height for the music.
  window.addEventListener('resize', () => render());
  render();
  if (!isMetaComplete(score.meta)) void runWizard();
}
