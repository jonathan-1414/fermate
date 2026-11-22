import type { ModuleConfig } from '../modules/types';
import { durationTicks } from './duration';
import type { EditResult } from './edit';
import { entryRange, instrumentById } from './instruments';
import { clearSpan, groupAt, itemEnd, type Item, type NoteEvent, type TripletUnit } from './items';
import { insertMeasure } from './measures';
import { beatLength, measureLengths } from './meter';
import { readItems, sortPitches, type StaffContext, writeItems, writeNote } from './overwrite';
import { pitchToMidi } from './pitch';
import { cleanTies, eventAtPosition } from './sequence';
import { allStaves, partOfStaff } from './staves';
import type { Pitch, Position, Score } from './types';

/**
 * Marking, copying, pasting and deleting several notes (CLAUDE.md, section 5, "Markieren,
 * Kopieren, Einfügen, Löschen"). Times are absolute ticks from the start of the piece.
 */

/** A marked rectangle: staves from first to last, time from `from` up to (not incl.) `to`. */
export interface Range {
  firstStaff: number;
  lastStaff: number;
  from: number;
  to: number;
}

/** What was copied: per staff its notes and triplet groups, at their offset from the start. */
export interface Clip {
  staves: ClipItem[][];
  length: number;
}

export type ClipItem =
  | { kind: 'note'; offset: number; event: NoteEvent }
  | { kind: 'group'; offset: number; unit: TripletUnit; slots: Array<NoteEvent | null> };

type Fail = Extract<EditResult, { ok: false }>;
const fail = (error: Fail['error']): Fail => ({ ok: false, error });

function lengthsOf(score: Score): number[] {
  return measureLengths(score.timeSignature, score.pickup, allStaves(score)[0].measures.length);
}

/** Absolute tick of a place in the piece. */
export function toAbsolute(score: Score, measure: number, tick: number): number {
  return lengthsOf(score).slice(0, measure).reduce((sum, l) => sum + l, 0) + tick;
}

/** Measure and tick of an absolute tick (the end of the piece gives the last measure's end). */
export function fromAbsolute(score: Score, abs: number): { measure: number; tick: number } {
  const lengths = lengthsOf(score);
  let start = 0;
  for (let m = 0; m < lengths.length; m++) {
    if (abs < start + lengths[m] || m === lengths.length - 1) return { measure: m, tick: abs - start };
    start += lengths[m];
  }
  return { measure: 0, tick: abs };
}

/** For each measure that the stretch [from, to) touches: the measure and the local stretch. */
function measuresIn(score: Score, from: number, to: number): Array<{ measure: number; start: number; end: number }> {
  const result: Array<{ measure: number; start: number; end: number }> = [];
  let offset = 0;
  lengthsOf(score).forEach((length, measure) => {
    const start = Math.max(from, offset) - offset;
    const end = Math.min(to, offset + length) - offset;
    if (end > start) result.push({ measure, start, end });
    offset += length;
  });
  return result;
}

/** A cut triplet group is marked completely: the stretch grows to the group's edges. */
function withWholeGroups(score: Score, range: Range): Range {
  let { from, to } = range;
  const staves = allStaves(score);
  for (let s = range.firstStaff; s <= range.lastStaff; s++) {
    for (const { measure } of measuresIn(score, from, to)) {
      const offset = toAbsolute(score, measure, 0);
      for (const item of readItems(staves[s], measure)) {
        if (item.type !== 'group') continue;
        const start = offset + item.start;
        const end = offset + itemEnd(item);
        if (start < from && from < end) from = start;
        if (start < to && to < end) to = end;
      }
    }
  }
  return { ...range, from, to };
}

/** The marking from one place to another (each at the start of a note or rest), both included. */
export function rangeBetween(score: Score, a: Position, b: Position): Range {
  const end = (p: Position) => {
    const event = eventAtPosition(score, p);
    return toAbsolute(score, p.measure, p.tick) + (event ? durationTicks(event.duration) : 0);
  };
  const starts = [toAbsolute(score, a.measure, a.tick), toAbsolute(score, b.measure, b.tick)];
  return withWholeGroups(score, {
    firstStaff: Math.min(a.staff, b.staff),
    lastStaff: Math.max(a.staff, b.staff),
    from: Math.min(...starts),
    to: Math.max(end(a), end(b)),
  });
}

/** Whole measures from one to another (both included), in all staves. */
export function measureRange(score: Score, a: number, b: number): Range {
  return {
    firstStaff: 0,
    lastStaff: allStaves(score).length - 1,
    from: toAbsolute(score, Math.min(a, b), 0),
    to: toAbsolute(score, Math.max(a, b) + 1, 0),
  };
}

/** Does the marking contain any note? */
export function rangeHasNotes(score: Score, range: Range): boolean {
  return copyRange(score, range) !== null;
}

/** "Löschen" with a marking: every marked note becomes rest, nothing moves. */
export function deleteRange(score: Score, range: Range): EditResult {
  if (!rangeHasNotes(score, range)) return fail('no-note');
  const copy = structuredClone(score);
  const lengths = lengthsOf(copy);
  for (let s = range.firstStaff; s <= range.lastStaff; s++) {
    const staff = allStaves(copy)[s];
    const ctx: StaffContext = { copy, staff, lengths };
    for (const { measure, start, end } of measuresIn(copy, range.from, range.to)) {
      const inside = (tick: number) => tick >= start && tick < end;
      const kept: Item[] = [];
      for (const item of readItems(staff, measure)) {
        if (item.type === 'note') {
          if (!inside(item.start)) kept.push(item);
        } else {
          kept.push({ ...item, slots: item.slots.map((slot, i) => (inside(item.start + i * item.unit) ? null : slot)) });
        }
      }
      writeItems(ctx, measure, kept);
    }
    cleanTies(staff);
  }
  return { ok: true, score: copy };
}

/** "Kopieren": the notes and triplet groups that start in the marking; null if there is none. */
export function copyRange(score: Score, range: Range): Clip | null {
  const staves = allStaves(score);
  const clip: Clip = { staves: [], length: range.to - range.from };
  let notes = 0;
  for (let s = range.firstStaff; s <= range.lastStaff; s++) {
    const items: ClipItem[] = [];
    for (const { measure, start, end } of measuresIn(score, range.from, range.to)) {
      const offset = toAbsolute(score, measure, 0) - range.from;
      for (const item of readItems(staves[s], measure)) {
        if (item.start < start || item.start >= end) continue;
        if (item.type === 'note') {
          items.push({ kind: 'note', offset: offset + item.start, event: structuredClone(item.event) });
          notes++;
        } else if (item.slots.some((slot) => slot !== null)) {
          items.push({ kind: 'group', offset: offset + item.start, unit: item.unit, slots: structuredClone(item.slots) });
          notes++;
        }
      }
    }
    clip.staves.push(items);
  }
  return notes > 0 ? clip : null;
}

/** The end of the clip's last note (a note may reach beyond the marking). */
function clipEnd(clip: Clip): number {
  let end = clip.length;
  for (const items of clip.staves) {
    for (const item of items) {
      const length = item.kind === 'note' ? durationTicks(item.event.duration) : 3 * item.unit;
      end = Math.max(end, item.offset + length);
    }
  }
  return end;
}

/**
 * "Einfügen": writes the clip from the cursor on, overwriting like a long note; several
 * staves go from the cursor's staff downwards. Empty measures are added at the end if
 * needed (up to the module's maximum). Where chords are not allowed only the highest tone
 * is taken; a tone outside the instrument's input range stops the whole paste.
 */
export function pasteClip(score: Score, module: ModuleConfig, at: Position, clip: Clip): EditResult {
  if (at.staff + clip.staves.length > allStaves(score).length) return fail('not-enough-staves');
  const start = toAbsolute(score, at.measure, at.tick);
  // Not in the middle of a triplet group (on any of the staves written to).
  for (let k = 0; k < clip.staves.length; k++) {
    const group = groupAt(readItems(allStaves(score)[at.staff + k], at.measure), at.tick);
    if (group && group.start !== at.tick) return fail('inside-triplet');
  }

  // Measures at the end, as many as needed.
  let work = score;
  const end = start + clipEnd(clip);
  while (toAbsolute(work, allStaves(work)[0].measures.length, 0) < end) {
    const added = insertMeasure(work, module, allStaves(work)[0].measures.length - 1);
    if (!added.ok) return fail('too-many-measures');
    work = added.score;
  }

  const copy = structuredClone(work);
  const lengths = lengthsOf(copy);
  const grid = Math.min(beatLength(copy.timeSignature), 48);
  for (let k = 0; k < clip.staves.length; k++) {
    const index = at.staff + k;
    const staff = allStaves(copy)[index];
    const ctx: StaffContext = { copy, staff, lengths };
    const range = entryRange(module, partOfStaff(copy, index));
    const chords = instrumentById(partOfStaff(copy, index)?.instrument ?? '')?.chords === true;
    const fitPitches = (pitches: Pitch[]): Pitch[] | null => {
      const sorted = sortPitches(pitches);
      const kept = chords ? sorted : sorted.slice(-1);
      return kept.every((p) => pitchToMidi(p) >= range.low && pitchToMidi(p) <= range.high) ? kept : null;
    };
    const fitNote = (note: NoteEvent | null): NoteEvent | null | 'out' => {
      if (!note) return null;
      const pitches = fitPitches(note.pitches);
      return pitches ? { ...structuredClone(note), pitches } : 'out';
    };

    // What is there is overwritten (partly covered notes and groups go, as when writing).
    for (const part of measuresIn(copy, start, start + clip.length)) {
      writeItems(ctx, part.measure, clearSpan(readItems(staff, part.measure), part.start, part.end));
    }
    for (const item of clip.staves[k]) {
      const place = fromAbsolute(copy, start + item.offset);
      const position = { staff: index, ...place };
      if (item.kind === 'note') {
        const note = fitNote(item.event);
        if (note === 'out') return fail('out-of-range');
        const error = writeNote(ctx, position, note!.pitches, note!.duration, note!.tieToNext === true);
        if (error) return error;
      } else {
        if (place.tick % grid !== 0 || place.tick + 3 * item.unit > lengths[place.measure]) return fail('triplet-position');
        const slots = item.slots.map(fitNote);
        if (slots.includes('out')) return fail('out-of-range');
        const items = clearSpan(readItems(staff, place.measure), place.tick, place.tick + 3 * item.unit);
        items.push({ type: 'group', start: place.tick, unit: item.unit, slots: slots as Array<NoteEvent | null> });
        writeItems(ctx, place.measure, items);
      }
    }
    cleanTies(staff);
  }
  return { ok: true, score: copy };
}
