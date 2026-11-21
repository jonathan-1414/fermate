import { inKey } from '../model/accidentals';
import { isValidDuration, plain } from '../model/duration';
import { History } from '../model/history';
import { isCompound } from '../model/meter';
import { isMetaComplete } from '../model/meta';
import {
  changeNoteDuration,
  changeNotePitch,
  deleteNoteAt,
  fitsTimeSignature,
  isAllowedDuration,
  isOnRest,
  restPreview,
  setAccidental,
  setTie,
  writeNoteAt,
} from '../model/overwrite';
import { isInRange, pitchAtStaffPosition } from '../model/pitch';
import { createEmptyScore } from '../model/score';
import { eventAtPosition, nextPosition, positionAtTick } from '../model/sequence';
import { staffAt } from '../model/staves';
import type { BaseValue, Duration, Pitch, Position, Score } from '../model/types';
import type { EditResult } from '../model/edit';
import type { ModuleConfig } from '../modules/types';
import { hitTest, staffPositionAt } from '../input/hitTest';
import { attachScoreInput } from '../input/scoreInput';
import type { ScoreLayout } from '../render/layout';
import { renderFullScore } from '../render/renderFull';
import { createPlayer } from '../playback/player';
import { buildSchedule } from '../playback/schedule';
import { loadScore, saveScore } from '../storage/autosave';
import { baseFileName } from '../export/filename';
import { buildHandIn } from '../export/handIn';
import { canShareFile, shareOrDownload } from '../export/share';
import { askForMeta, askHandIn, confirm, showInfo } from './dialogs';
import { createTimedReveal } from './timedReveal';
import { createScoreHeader } from './scoreHeader';
import { createFullToolbar } from './toolbarFull';

const NOTE_NAMES_SHOW_MS = 5000;
const NOTE_NAMES_LOCK_MS = 30000;

interface Snapshot {
  score: Score;
  cursor: Position;
}

type Gesture =
  | { kind: 'place'; before: Snapshot }
  | { kind: 'drag'; before: Snapshot; changed: boolean };

/**
 * The app of the full version (…/?modul=voll). Input as described in CLAUDE.md,
 * section 5: the cursor always stands on a note or rest (shown selected); a value
 * chosen on a rest shows how the rest is split; a second tap on the selected rest
 * sets a note there (it overwrites), on a selected note it changes the pitch.
 */
export function startFullApp(root: HTMLElement, module: ModuleConfig): void {
  root.innerHTML = `
    <header class="toolbar"></header>
    <main class="score-area"><div class="sheet"><div id="score"></div></div></main>
    <div class="toolbar toolbar-bottom"></div>
    <footer class="app-footer"><button type="button" class="link-button">Info und Lizenzen</button></footer>
  `;
  root.querySelector('.app-footer button')!.addEventListener('click', showInfo);
  const scoreElement = root.querySelector<HTMLDivElement>('#score')!;
  const header = createScoreHeader(root.querySelector('.sheet')!, () => void askForDetails('edit'));

  let score = loadScore(module) ?? createEmptyScore(module);
  let savedScore: Score | null = score;
  let cursor: Position = { staff: 0, measure: 0, tick: 0 };
  /**
   * Was the note at the cursor selected by a tap? Only then does the next tap change it
   * (first tap: select, second tap: change). When the cursor lands on a note by itself
   * (opening, undo, after setting a note in front of it), the next tap only selects it.
   */
  let selectedByTap = false;
  let duration: Duration = plain(48);
  let showNoteNames = false;
  let preview: { at: Position; pitch: Pitch } | null = null;
  let gesture: Gesture | null = null;
  let layout: ScoreLayout | null = null;
  const history = new History<Snapshot>();

  let playing: Position | null = null;
  let playedScore: Score | null = null;
  const player = createPlayer({
    onNote(at) {
      if (at && !playedScore) return;
      playing = at;
      render();
    },
    onEnd() {
      playing = null;
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
  function applyDuration(d: Duration): void {
    if (!isAllowedDuration(module, score.timeSignature, d)) return;
    if (selectedNote()) {
      if (!commit(changeNoteDuration(score, module, cursor, d))) return;
    }
    duration = d;
    render();
  }

  const toolbar = createFullToolbar(root.querySelector('header.toolbar')!, root.querySelector('.toolbar-bottom')!, {
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
      render();
      void player.play(schedule);
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
    async newScore() {
      const yes = await confirm('Neue Partitur beginnen? Alle Noten dieser Partitur werden gelöscht.', 'Neu beginnen');
      if (!yes) return;
      player.stop();
      score = createEmptyScore(module);
      cursor = { staff: 0, measure: 0, tick: 0 };
      selectedByTap = false;
      history.clear();
      render();
      await askForDetails('start');
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
      // Dot and triplet stay switched on if the new value can have them.
      const keep = (d: Duration) => (isValidDuration(d) ? d : plain(base));
      applyDuration(keep({ base, dotted: duration.dotted, triplet: duration.triplet }));
    },
    toggleDot() {
      applyDuration({ ...duration, dotted: !duration.dotted, triplet: false });
    },
    toggleTriplet() {
      applyDuration({ ...duration, triplet: !duration.triplet, dotted: false });
    },
    setAccidental(alter) {
      if (commit(setAccidental(score, module, cursor, alter))) render();
    },
    toggleTie() {
      const note = selectedNote();
      if (note && commit(setTie(score, module, cursor, !note.tieToNext))) render();
    },
    deleteSelection() {
      if (commit(deleteNoteAt(score, cursor))) render();
    },
  });

  function restore(snapshot: Snapshot): void {
    // Undo and redo are for the notes only: the details (names, class, title) stay.
    score = { ...snapshot.score, meta: score.meta };
    cursor = snapshot.cursor;
    selectedByTap = false;
    duration = selectedNote()?.duration ?? duration;
    render();
  }

  const noteNames = createTimedReveal(NOTE_NAMES_SHOW_MS, NOTE_NAMES_LOCK_MS, (phase, ms) => {
    showNoteNames = phase === 'showing';
    toolbar.setNoteNamesPhase(phase, ms);
    render();
  });

  async function askForDetails(mode: 'start' | 'edit'): Promise<void> {
    const meta = await askForMeta(mode, score.meta);
    if (!meta) return;
    score = { ...score, meta };
    render();
  }

  /** What is drawn: the score, with the preview note or the split rest. */
  function shownScore(): Score {
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
    });
    header.update(score.meta);
    const ts = score.timeSignature;
    const note = selectedNote();
    const fits = (d: Duration) => isAllowedDuration(module, ts, d) && fitsTimeSignature(ts, d);
    toolbar.update({
      duration,
      bases: (module.durations as BaseValue[]).filter((base) => fits(plain(base))),
      canDot: fits({ base: duration.base, dotted: true, triplet: false }),
      tripletsShown: module.triplets && !isCompound(ts),
      canTriplet: fits({ base: duration.base, dotted: false, triplet: true }),
      alter: note ? note.pitches[0].alter : null,
      tie: note && module.ties ? note.tieToNext === true : null,
      canDelete: note !== null,
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      playing: playedScore !== null,
    });
  }

  const samePosition = (a: Position, b: Position) => a.staff === b.staff && a.measure === b.measure && a.tick === b.tick;

  /** Pitch under the finger as the key makes it (new notes follow the key), or null outside the range. */
  function pitchAt(y: number): Pitch | null {
    if (!layout) return null;
    const clef = staffAt(score, cursor.staff)!.clef;
    const pitch = inKey(pitchAtStaffPosition(clef, staffPositionAt(layout, y)), score.keySignature);
    return isInRange(pitch, module.range) ? pitch : null;
  }

  const samePitch = (a: Pitch | null, b: Pitch | null) =>
    a === b || (a !== null && b !== null && a.step === b.step && a.octave === b.octave && a.alter === b.alter);

  /** Moves the selected note to the pitch under the finger; tied notes move along. */
  function dragTo(drag: Extract<Gesture, { kind: 'drag' }>, y: number): boolean {
    const pitch = pitchAt(y);
    if (!pitch || samePitch(pitch, selectedNote()?.pitches[0] ?? null)) return false;
    const result = changeNotePitch(score, module, cursor, pitch);
    if (!result.ok) return false;
    score = result.score;
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
      if (!layout) return;
      const hit = hitTest(layout, x, y);
      if (!hit) return;
      const before = { score, cursor };
      // The spot under the finger, as drawn (a split rest counts with its parts).
      let spot: Position = { staff: 0, measure: hit.measure, tick: hit.noteTick ?? hit.columnTick };
      if (eventAtPosition(score, spot) === null && !isOnRest(score, spot)) {
        spot = positionAtTick(score, 0, hit.measure, spot.tick) ?? spot;
      }

      // The first tap on a spot only selects it; on a note, the toolbar shows its value.
      // A note is changed only by a second tap on it.
      if (!samePosition(spot, cursor) || (selectedNote() && !selectedByTap)) {
        cursor = spot;
        selectedByTap = true;
        duration = selectedNote()?.duration ?? duration;
        render();
        return;
      }
      if (selectedNote()) {
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
      const done = gesture;
      gesture = null;
      if (done?.kind === 'place' && preview) {
        const result = writeNoteAt(score, module, preview.at, [preview.pitch], duration);
        if (result.ok) {
          history.push(done.before);
          score = result.score;
          cursor = nextPosition(score, preview.at);
          selectedByTap = false; // on a rest: the next tap writes; on a note: it only selects
          duration = selectedNote()?.duration ?? duration;
        }
      }
      if (done?.kind === 'drag' && done.changed) history.push(done.before);
      preview = null;
      render();
    },

    cancel() {
      if (gesture?.kind === 'drag' && gesture.changed) score = gesture.before.score;
      gesture = null;
      preview = null;
      render();
    },
  });

  render();
  if (!isMetaComplete(score.meta)) void askForDetails('start');
}
