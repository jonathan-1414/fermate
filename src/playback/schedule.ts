import { TICKS_PER_QUARTER } from '../model/constants';
import { eventTicks } from '../model/duration';
import { isCompound } from '../model/meter';
import { type Located, staffEvents } from '../model/sequence';
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

/** Swing: the second of two eighths on a quarter starts this many ticks later (2:1). */
const SWING_DELAY = 8;

/**
 * Swing (CLAUDE.md, "Swing-Achtel"): in which quarters of each measure are there exactly
 * two plain eighths (notes or rests), on the beat and in the middle? Only those swing:
 * the second eighth comes later, the first gets longer. Key: `measure:quarterStart`.
 */
export function swingQuarters(events: Located[]): Set<string> {
  const byQuarter = new Map<string, Located[]>();
  for (const located of events) {
    const key = `${located.measure}:${located.tick - (located.tick % TICKS_PER_QUARTER)}`;
    byQuarter.set(key, [...(byQuarter.get(key) ?? []), located]);
  }
  const eighth = (l: Located) => !l.event.duration.dotted && !l.event.duration.triplet && l.event.duration.base === 24;
  const swinging = new Set<string>();
  for (const [key, list] of byQuarter) {
    const start = Number(key.split(':')[1]);
    if (list.length === 2 && list.every(eighth) && list[0].tick === start && list[1].tick === start + 24) swinging.add(key);
  }
  return swinging;
}

/**
 * Turns the score into a list of timed notes. Automatic rests are silence without a
 * marking. Tied notes sound as one long note. A chord is one entry per pitch. With swing,
 * two eighths on a quarter sound long–short (2:1).
 * Ticks become seconds via the tempo (quarter notes per minute).
 */
export interface ScheduleSection {
  /** Absolute tick to start at (from the start of the piece). */
  from: number;
  /** Absolute tick to stop before; Infinity = to the end. */
  to: number;
  /** Only these staves (a marking); all if not given. */
  firstStaff?: number;
  lastStaff?: number;
}

/**
 * Where "Abspielen" starts (CLAUDE.md, "Abspielen ab dem Cursor"): at the cursor, unless
 * nothing that sounds comes after it (just finished writing): then at the start.
 */
export function playbackStart(score: Score, cursorTick: number): number {
  const later = allStaves(score).some((staff) => {
    let measureStart = 0;
    let lastMeasure = -1;
    let measureLength = 0;
    return staffEvents(staff).some(({ measure, tick, event }) => {
      if (measure !== lastMeasure) {
        measureStart += measureLength;
        lastMeasure = measure;
      }
      measureLength = tick + eventTicks(event);
      return event.kind === 'note' && measureStart + tick >= cursorTick;
    });
  });
  return later ? cursorTick : 0;
}

export function buildSchedule(score: Score, section: ScheduleSection = { from: 0, to: Infinity }): Schedule {
  const secondsPerTick = 60 / score.tempo / TICKS_PER_QUARTER;
  const offset = section.from * secondsPerTick;
  // No swing in 6/8 (the switch is greyed out there).
  const swing = score.swing && !isCompound(score.timeSignature);
  const notes: ScheduledNote[] = [];
  allStaves(score).forEach((staff, staffIndex) => {
    if (section.firstStaff !== undefined && staffIndex < section.firstStaff) return;
    if (section.lastStaff !== undefined && staffIndex > section.lastStaff) return;
    const part = score.parts.indexOf(partOfStaff(score, staffIndex)!);
    let measureStart = 0;
    let lastMeasure = -1;
    let measureLength = 0;
    /** Notes still sounding because a tie leads on: pitch → its entry. */
    let open = new Map<string, ScheduledNote>();
    const events = staffEvents(staff);
    // Swing changes only when the second eighth of a swinging quarter starts.
    const swinging = swing ? swingQuarters(events) : new Set<string>();
    const swung = (measure: number, tick: number) => {
      const quarter = tick - (tick % TICKS_PER_QUARTER);
      return tick % TICKS_PER_QUARTER === 24 && swinging.has(`${measure}:${quarter}`) ? tick + SWING_DELAY : tick;
    };
    for (const { measure, tick, event } of events) {
      if (measure !== lastMeasure) {
        measureStart += measureLength;
        measureLength = 0;
        lastMeasure = measure;
      }
      measureLength = tick + eventTicks(event);
      // Only the section: a note tied into it from before starts as a new note.
      const absolute = measureStart + tick;
      if (absolute < section.from || absolute >= section.to) {
        open = new Map();
        continue;
      }
      const start = swung(measure, tick);
      const time = (measureStart + start) * secondsPerTick - offset;
      const duration = (swung(measure, tick + eventTicks(event)) - start) * secondsPerTick;
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
