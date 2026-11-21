import { TICKS_PER_QUARTER } from '../model/constants';
import { eventTicks } from '../model/duration';
import { staffEvents } from '../model/sequence';
import { allStaves, partOfStaff } from '../model/staves';
import type { Pitch, Position, Score } from '../model/types';

/**
 * One note to play: when (seconds from the start), how long, which pitch, where it is,
 * and which instrument (part) plays it. Entries with note: null are silent: a set rest,
 * or a note tied to the one before (it sounds as part of that note), so that the
 * marking still runs over it.
 */
export interface ScheduledNote {
  time: number;
  duration: number;
  note: string | null; // e.g. 'C4', 'F#5' (as Tone.js expects it)
  at: Position;
  part: number;
}

export interface Schedule {
  notes: ScheduledNote[];
  /** End of the last note or set rest; playback stops here (gaps after it are not waited for). */
  end: number;
}

export function noteName(p: Pitch): string {
  return `${p.step}${p.alter === 1 ? '#' : p.alter === -1 ? 'b' : ''}${p.octave}`;
}

/**
 * Turns the score into a list of timed notes. Automatic rests are silence without a
 * marking. Tied notes sound as one long note. A chord is one entry per pitch.
 * Ticks become seconds via the tempo (quarter notes per minute).
 */
export function buildSchedule(score: Score): Schedule {
  const secondsPerTick = 60 / score.tempo / TICKS_PER_QUARTER;
  const notes: ScheduledNote[] = [];
  allStaves(score).forEach((staff, staffIndex) => {
    const part = score.parts.indexOf(partOfStaff(score, staffIndex)!);
    let measureStart = 0;
    let lastMeasure = -1;
    let measureLength = 0;
    /** Notes still sounding because a tie leads on: pitch → its entry. */
    let open = new Map<string, ScheduledNote>();
    for (const { measure, tick, event } of staffEvents(staff)) {
      if (measure !== lastMeasure) {
        measureStart += measureLength;
        measureLength = 0;
        lastMeasure = measure;
      }
      measureLength = tick + eventTicks(event);
      const time = (measureStart + tick) * secondsPerTick;
      const duration = eventTicks(event) * secondsPerTick;
      const at = { staff: staffIndex, measure, tick };
      if (event.kind === 'rest') {
        open = new Map();
        if (!event.auto) notes.push({ time, duration, note: null, at, part });
        continue;
      }
      const sounding = new Map<string, ScheduledNote>();
      let continued = false;
      for (const pitch of event.pitches) {
        const name = noteName(pitch);
        const before = open.get(name);
        if (before) {
          before.duration += duration; // tied: the note simply sounds longer
          sounding.set(name, before);
          continued = true;
        } else {
          const entry = { time, duration, note: name, at, part };
          notes.push(entry);
          sounding.set(name, entry);
        }
      }
      // A note that only continues tied notes still gets its marking.
      if (continued && sounding.size === event.pitches.length && [...sounding.values()].every((e) => e.time < time)) {
        notes.push({ time, duration, note: null, at, part });
      }
      open = event.tieToNext ? sounding : new Map();
    }
  });
  notes.sort((a, b) => a.time - b.time);
  // Nothing but set rests: there is nothing to hear.
  if (!notes.some((n) => n.note !== null)) return { notes: [], end: 0 };
  const end = Math.max(...notes.map((n) => n.time + n.duration));
  return { notes, end };
}
