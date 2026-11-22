import { inKey } from '../model/accidentals';
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
import { isWholeMeasureRest, leftTripletGroup, valueAfterWriting } from '../model/value';
import type { EditResult } from '../model/edit';
import type { ModuleConfig } from '../modules/types';
import { hitTest, staffPositionAt } from '../input/hitTest';
import { attachScoreInput } from '../input/scoreInput';
import { MAX_ZOOM, MIN_ZOOM, renderFullScore, setDrawingZoom, ZOOM, type FullLayout, type StaffLayout } from '../render/renderFull';
import { clampZoom, scrollAfterZoom, zoomForWheel } from '../input/zoom';
import { loadZoom, saveZoom } from '../storage/zoom';
import { createPlayer } from '../playback/player';
import { buildSchedule } from '../playback/schedule';
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
import { deleteMeasure, insertMeasure, setKeySignature, setPickup, setTimeSignature } from '../model/measures';
import { createOverview, createVerticalOverview } from './overview';

const NOTE_NAMES_SHOW_MS = 5000;
const NOTE_NAMES_LOCK_MS = 30000;

const READ_ERRORS: Record<ReadError, string> = {
  unreadable: 'Diese Datei lässt sich nicht öffnen. Sie ist keine Fermate-Datei oder beschädigt.',
  'other-module': 'Diese Datei wurde in einem anderen Modul von Fermate geschrieben und lässt sich hier nicht öffnen.',
};

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
  let zoom = clampZoom(loadZoom() ?? ZOOM, MIN_ZOOM, MAX_ZOOM);
  let pinchFrom = zoom;
  let beforeDown: {
    cursor: Position;
    selectedByTap: boolean;
    tone: number;
    duration: Duration;
    noValueAt: Position | null;
    dotOnce: boolean;
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

  // "Datei öffnen": the device's own file picker. No file type filter: on the iPad an
  // unknown ending like .fermate would make every file greyed out.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.hidden = true;
  root.append(fileInput);
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // the same file can be chosen again
    if (file) void openFile(file);
  });

  const toolbar = createFullToolbar(root.querySelector('header.toolbar')!, root.querySelector('.toolbar-bottom')!, {
    deleteMeasure() {
      if (!commit(deleteMeasure(score, module, cursor.measure))) return;
      const count = staffAt(score, cursor.staff)!.measures.length;
      cursor = { staff: cursor.staff, measure: Math.min(cursor.measure, count - 1), tick: 0 };
      selectedByTap = false;
      noValueAt = null;
      render();
    },
    togglePlay() {
      if (player.isPlaying() || playedScore) {
        player.stop();
        playedScore = null;
        render();
        return;
      }
      const schedule = buildSchedule(score);
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
      if (commit(setAccidental(score, module, cursor, alter, tone))) {
        followTone(selectedPitch()?.step, selectedPitch()?.octave, alter);
        render();
      }
    },
    toggleTie() {
      const note = selectedNote();
      if (note && commit(setTie(score, module, cursor, !note.tieToNext))) render();
    },
    toggleChord() {
      chordMode = !chordMode;
      render();
    },
    deleteSelection() {
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

  function resetCursor(): void {
    cursor = { staff: 0, measure: 0, tick: 0 };
    selectedByTap = false;
    tone = 0;
    chordMode = false;
    noValueAt = null;
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
      alter: note ? (selectedPitch()?.alter ?? null) : null,
      tie: note && module.ties ? note.tieToNext === true : null,
      chordShown: chordsOn(cursor.staff),
      chordMode,
      canDelete: note !== null,
      canDeleteMeasure: canDeleteMeasure(),
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      playing: playedScore !== null,
      loading: loadingSound && playedScore !== null,
      tempoGlyph: tempoUnit().glyph,
      tempo: Math.round(score.tempo / tempoUnit().factor),
      swing: score.swing,
      canSwing: !isCompound(ts),
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
  function canDeleteMeasure(): boolean {
    const count = allStaves(score)[0].measures.length;
    return count > Math.max(module.minMeasures, score.pickup > 0 ? 2 : 1) || score.pickup > 0;
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
    verticalOverview.update({
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
    const pitch = inKey(pitchAtStaffPosition(clef, staffPositionAt(band, y)), score.keySignature);
    const range = entryRange(module, partOfStaff(score, cursor.staff));
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

  attachScoreInput(scoreElement, {
    down(x, y) {
      // Remembered in case a second finger follows (zooming must not move the cursor).
      beforeDown = { cursor, selectedByTap, tone, duration, noValueAt, dotOnce };
      const band = staffLayoutAt(y);
      if (!band) return;
      const hit = hitTest(band, x, y);
      if (!hit) return;
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
      if (!samePosition(spot, cursor) || (selectedNote() && !selectedByTap) || otherTone) {
        const drawn = eventAtPosition(shownScore(), spot);
        cursor = spot;
        selectedByTap = true;
        tone = tappedTone ?? 0;
        takeValueOfSelection(drawn);
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

    move(_x, y) {
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
      if (gesture?.kind === 'drag' && gesture.changed) score = gesture.before.score;
      gesture = null;
      preview = null;
      render();
    },
  }, {
    // Two fingers on the music: only the music gets larger or smaller.
    start() {
      if (beforeDown) {
        ({ cursor, selectedByTap, tone, duration, noValueAt, dotOnce } = beforeDown);
        beforeDown = null;
        render();
      }
      pinchFrom = zoom;
    },
    change(ratio, centerX, centerY) {
      zoomTo(pinchFrom * ratio, centerX, centerY);
    },
    end() {
      saveZoom(zoom);
      render();
    },
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
