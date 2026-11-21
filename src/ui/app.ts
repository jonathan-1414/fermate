import { advanceCursor, initialCursor, positionForTap } from '../model/cursor';
import { isMetaComplete } from '../model/meta';
import { canPlace, changeDuration, changePitch, deleteEvent, setNote, setRest } from '../model/edit';
import { History } from '../model/history';
import { isInRange, pitchAtStaffPosition } from '../model/pitch';
import { createEmptyScore } from '../model/score';
import { isOccupant } from '../model/measure';
import { eventTicks } from '../model/duration';
import { staffAt } from '../model/staves';
import type { Pitch, Position, Score, ScoreEvent } from '../model/types';
import type { ModuleConfig } from '../modules/types';
import { hitTest, staffPositionAt } from '../input/hitTest';
import { attachScoreInput } from '../input/scoreInput';
import type { ScoreLayout } from '../render/layout';
import { renderScore } from '../render/renderScore';
import { createPlayer } from '../playback/player';
import { buildSchedule } from '../playback/schedule';
import { loadScore, saveScore } from '../storage/autosave';
import { baseFileName } from '../export/filename';
import { buildHandIn } from '../export/handIn';
import { canShareFile, shareOrDownload } from '../export/share';
import { askForMeta, askHandIn, confirm, showInfo } from './dialogs';
import { createTimedReveal } from './timedReveal';
import { createScoreHeader } from './scoreHeader';
import { createToolbar } from './toolbar';

const NOTE_NAMES_SHOW_MS = 5000;
const NOTE_NAMES_LOCK_MS = 30000;

interface Snapshot {
  score: Score;
  cursor: Position;
}

type Gesture =
  | { kind: 'place'; before: Snapshot }
  | { kind: 'drag'; at: Position; before: Snapshot; changed: boolean };

/** Connects model, drawing, toolbar and input. Holds the current state of the app. */
export function startApp(root: HTMLElement, module: ModuleConfig): void {
  root.innerHTML = `
    <header class="toolbar"></header>
    <main class="score-area"><div class="sheet"><div id="score"></div></div></main>
    <footer class="app-footer"><button type="button" class="link-button">Info und Lizenzen</button></footer>
  `;
  root.querySelector('.app-footer button')!.addEventListener('click', showInfo);
  const scoreElement = root.querySelector<HTMLDivElement>('#score')!;
  // Title, names and class above the music; tapping them changes the details.
  const header = createScoreHeader(root.querySelector('.sheet')!, () => void askForDetails('edit'));

  // The last state is loaded from the browser; every change is saved right away.
  let score = loadScore(module) ?? createEmptyScore(module);
  let savedScore: Score | null = score;
  let cursor: Position = initialCursor(score);
  let duration = module.durations.includes(48) ? 48 : module.durations[0];
  let showNoteNames = false;
  let preview: { at: Position; pitch: Pitch } | null = null;
  let gesture: Gesture | null = null;
  let layout: ScoreLayout | null = null;
  const history = new History<Snapshot>();
  // Playback: plays a copy of the score; any change to the score stops it.
  let playing: Position | null = null;
  let playedScore: Score | null = null;
  const player = createPlayer(
    {
      onSounding(list) {
        const at = list[0] ?? null;
        if (at && !playedScore) return; // a late marking after the stop
        playing = at;
        render();
      },
      onEnd() {
        playing = null;
        playedScore = null;
        render();
      },
    },
    { modul1: true },
  );
  // iOS allows sound only after a touch: unlock the audio on every early touch.
  for (const type of ['pointerdown', 'pointerup', 'keydown'] as const) {
    document.addEventListener(type, () => player.unlock(), { capture: true });
  }


  const toolbar = createToolbar(root.querySelector('.toolbar')!, module.durations, module.manualRests, {
    togglePlay() {
      if (player.isPlaying() || playedScore) {
        player.stop();
        playedScore = null;
        render();
        return;
      }
      const schedule = buildSchedule(score);
      if (schedule.notes.length === 0) return; // nothing to play (no notes)
      playedScore = score; // while playing, only the sounding note is marked
      render();
      void player.play(schedule, [{ instrument: 'piano', volume: 1, mute: false, solo: false }]);
    },
    selectDuration(ticks) {
      // With the cursor on a note or set rest, the button changes its value
      // (if the new value fits; otherwise nothing changes).
      const selection = selectedEvent();
      if (selection) {
        const result = changeDuration(score, module, selection, ticks);
        if (!result.ok) return;
        history.push({ score, cursor });
        score = result.score;
      }
      duration = ticks;
      render();
    },
    setRest() {
      // On a note: it becomes a rest of the same value. In the free space: a rest of the
      // chosen value is appended (if it fits). On a set rest: nothing to do.
      const ticks = eventTicksAt(cursor);
      if (ticks !== null && restAt(cursor)) return;
      const result = setRest(score, module, cursor, ticks ?? duration);
      if (!result.ok) return;
      history.push({ score, cursor });
      score = result.score;
      if (ticks === null) cursor = advanceCursor(score, cursor);
      render();
    },
    undo() {
      const previous = history.undo();
      if (!previous) return;
      // Undo is for notes only: the details (names, class, title) stay as they are.
      score = { ...previous.score, meta: score.meta };
      cursor = previous.cursor;
      duration = eventTicksAt(cursor) ?? duration; // on a note or rest, the toolbar shows its value
      render();
    },
    deleteSelection() {
      const selection = selectedEvent();
      if (!selection) return;
      const result = deleteEvent(score, selection);
      if (!result.ok) return;
      history.push({ score, cursor });
      score = result.score;
      cursor = advanceCursor(score, selection); // behind the last note of that measure
      render();
    },
    async newScore() {
      const yes = await confirm('Neue Partitur beginnen? Alle Noten dieser Partitur werden gelöscht.', 'Neu beginnen');
      if (!yes) return;
      player.stop();
      // Everything starts empty, also names, class and title.
      score = createEmptyScore(module);
      cursor = initialCursor(score);
      history.clear();
      render();
      await askForDetails('start');
    },
    handIn() {
      player.stop();
      const date = new Date(); // the day of handing in
      const handedIn = score;
      void askHandIn({
        fileName: (formats) =>
          `${baseFileName(handedIn.meta, date)}.${formats.length > 1 ? 'zip' : formats[0]}`,
        prepare: (formats) => buildHandIn(handedIn, formats, date),
        canShare: canShareFile,
        deliver: shareOrDownload,
      });
    },
    showNoteNames() {
      noteNames.start();
    },
  });

  // Note names can only be peeked at: shown for a few seconds, then locked for a while,
  // so that students read the notes instead of playing by letters.
  const noteNames = createTimedReveal(NOTE_NAMES_SHOW_MS, NOTE_NAMES_LOCK_MS, (phase, ms) => {
    showNoteNames = phase === 'showing';
    toolbar.setNoteNamesPhase(phase, ms);
    render();
  });

  /** Start dialog (required) or changing the details later. */
  async function askForDetails(mode: 'start' | 'edit'): Promise<void> {
    const meta = await askForMeta(mode, score.meta);
    if (!meta) return;
    score = { ...score, meta };
    render();
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
    let shown = score;
    if (preview) {
      const result = setNote(score, module, preview.at, preview.pitch, duration);
      if (result.ok) shown = result.score;
    }
    layout = renderScore(scoreElement, shown, {
      showNoteNames,
      cursor: preview || playedScore ? null : cursor,
      selection: preview || playedScore ? null : selectedEvent(),
      preview: preview?.at ?? null,
      playing,
      showRests: module.showRests,
      measureCheck: module.measureCheck,
    });
    header.update(score.meta);
    toolbar.update({
      duration,
      canUndo: history.canUndo(),
      canDelete: selectedEvent() !== null,
      onRest: restAt(cursor),
      playing: playedScore !== null,
    });
  }

  /** The note or set rest that starts at this position, if there is one (not a gap). */
  function eventAt(at: Position): ScoreEvent | null {
    let start = 0;
    for (const event of staffAt(score, at.staff)!.measures[at.measure]) {
      if (start === at.tick && isOccupant(event)) return event;
      start += eventTicks(event);
    }
    return null;
  }

  /** Value of the note or set rest that starts at this position, if there is one. */
  function eventTicksAt(at: Position): number | null {
    const event = eventAt(at);
    return event ? eventTicks(event) : null;
  }

  function restAt(at: Position): boolean {
    return eventAt(at)?.kind === 'rest';
  }

  /** The note or rest the cursor stands on (it is shown as selected), or null in free space. */
  function selectedEvent(): Position | null {
    return eventAt(cursor) !== null ? cursor : null;
  }

  function samePosition(a: Position, b: Position): boolean {
    return a.staff === b.staff && a.measure === b.measure && a.tick === b.tick;
  }

  /**
   * Moves the dragged note to the pitch under the finger; a set rest becomes a note
   * of the same value there. Returns whether anything changed.
   */
  function changePitchTo(drag: Extract<Gesture, { kind: 'drag' }>, y: number): boolean {
    const pitch = pitchAt(y);
    if (!pitch) return false;
    const event = eventAt(drag.at);
    const result =
      event?.kind === 'rest'
        ? setNote(score, module, drag.at, pitch, eventTicks(event))
        : changePitch(score, module, drag.at, pitch);
    if (!result.ok || JSON.stringify(result.score) === JSON.stringify(score)) return false;
    score = result.score;
    drag.changed = true;
    return true;
  }

  /** Pitch under the finger, or null outside the module's range. */
  function pitchAt(y: number): Pitch | null {
    if (!layout) return null;
    const clef = staffAt(score, cursor.staff)!.clef;
    const pitch = pitchAtStaffPosition(clef, staffPositionAt(layout, y));
    return isInRange(pitch, module.range) ? pitch : null;
  }

  attachScoreInput(scoreElement, {
    down(x, y) {
      if (!layout) return;
      const hit = hitTest(layout, x, y);
      if (!hit) return;
      const before = { score, cursor };
      // The spot under the finger: a note or set rest (its head or its column), or else
      // the free space behind the last note of the measure.
      const spot = positionForTap(score, cursor.staff, hit.measure, hit.noteTick ?? hit.columnTick);

      // Notes are only placed or changed where the cursor is. Touching another spot
      // only moves the cursor there. On a note, the toolbar shows that note's value.
      if (!samePosition(spot, cursor)) {
        cursor = spot;
        duration = eventTicksAt(cursor) ?? duration;
        render();
        return;
      }

      // The cursor is on a note: it follows the finger up and down (changing its pitch).
      // On a set rest: it becomes a note at the finger, which then follows the finger.
      if (eventAt(cursor) !== null) {
        gesture = { kind: 'drag', at: cursor, before, changed: false };
        changePitchTo(gesture, y);
        render();
        return;
      }

      // The cursor is in the free space: a preview note follows the finger,
      // it is placed when the finger is lifted.
      if (canPlace(score, module, cursor, duration)) {
        gesture = { kind: 'place', before };
        const pitch = pitchAt(y);
        preview = pitch ? { at: cursor, pitch } : null;
      }
      render();
    },

    move(_x, y) {
      if (!gesture) return;
      const pitch = pitchAt(y);
      if (gesture.kind === 'place') {
        const changed =
          (pitch === null) !== (preview === null) ||
          (pitch !== null && preview !== null && (pitch.step !== preview.pitch.step || pitch.octave !== preview.pitch.octave));
        if (!changed) return;
        preview = pitch ? { at: cursor, pitch } : null;
        render();
        return;
      }
      if (changePitchTo(gesture, y)) render();
    },

    up() {
      const done = gesture;
      gesture = null;
      if (done?.kind === 'place' && preview) {
        const result = setNote(score, module, preview.at, preview.pitch, duration);
        if (result.ok) {
          history.push(done.before);
          score = result.score;
          cursor = advanceCursor(score, preview.at);
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
