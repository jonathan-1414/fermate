import type { ModuleConfig } from '../modules/types';
import { durationTicks, isValidDuration } from './duration';
import type { EditResult } from './edit';
import { clearSpan, fromItems, groupAt, type Item, type NoteEvent, toItems } from './items';
import { beatLength, fullMeasureLength, isCompound, measureLengths, splitIntoValues } from './meter';
import { entryRange, instrumentById } from './instruments';
import { parsePitch, pitchToMidi } from './pitch';
import { cleanTies, indexAt, samePitch, staffEvents, tieChain } from './sequence';
import { allStaves, partOfStaff } from './staves';
import type { Duration, Pitch, Position, Score, Staff, TimeSignature } from './types';

/**
 * Editing rules of the full version (CLAUDE.md, section 5, "Eingabe"): wherever there
 * is no note there is a rest, written by the app; input overwrites, nothing moves.
 * All functions are pure: they return a new score or the reason why nothing changes.
 */

type Fail = Extract<EditResult, { ok: false }>;
const fail = (error: Fail['error']): Fail => ({ ok: false, error });

/** Is this note value allowed in this module and time signature? */
export function isAllowedDuration(module: ModuleConfig, ts: TimeSignature, d: Duration): boolean {
  if (!isValidDuration(d) || !module.durations.includes(d.base)) return false;
  if (d.dotted && !module.dotted) return false;
  if (d.triplet && (!module.triplets || isCompound(ts))) return false;
  return true;
}

/**
 * Can this value ever fit into a measure of this time signature? Values that never fit
 * (a whole note in 3/4) are hidden in the toolbar.
 */
export function fitsTimeSignature(ts: TimeSignature, d: Duration): boolean {
  return durationTicks(d) <= fullMeasureLength(ts);
}

/** Everything an edit needs to know about one staff. */
interface StaffContext {
  copy: Score;
  staff: Staff;
  lengths: number[];
}

function context(score: Score, at: Position): StaffContext | null {
  const copy = structuredClone(score);
  const staff = allStaves(copy)[at.staff];
  if (!staff || !staff.measures[at.measure]) return null;
  return { copy, staff, lengths: measureLengths(copy.timeSignature, copy.pickup, staff.measures.length) };
}

/**
 * Can a note be written here? At the start of any event, or anywhere inside a rest
 * (on the sixteenth grid): choosing a value on a rest splits it, and the note goes
 * to the start of the chosen part. Never inside a note.
 */
function isWritable(staff: Staff, at: Position): boolean {
  let start = 0;
  for (const event of staff.measures[at.measure]) {
    const end = start + durationTicks(event.duration);
    if (at.tick === start) return true;
    if (at.tick < end) return event.kind === 'rest' && !event.duration.triplet && at.tick % 12 === 0;
    start = end;
  }
  return false;
}

function readItems(staff: Staff, measure: number): Item[] {
  const items = toItems(staff.measures[measure]);
  if (!items) throw new Error('Broken measure');
  return items;
}

function writeItems(ctx: StaffContext, measure: number, items: Item[]): void {
  ctx.staff.measures[measure] = fromItems(items, ctx.lengths[measure], ctx.copy.timeSignature);
}

function done(ctx: StaffContext): EditResult {
  cleanTies(ctx.staff);
  return { ok: true, score: ctx.copy };
}

const noteOf = (pitches: Pitch[], duration: Duration, tieToNext = false): NoteEvent =>
  tieToNext ? { kind: 'note', pitches, duration, tieToNext } : { kind: 'note', pitches, duration };

/**
 * Writes a note into the staff at a position, overwriting what is there (in the
 * context `ctx`). Triplets go into their group; a longer note overwrites what
 * follows and is tied over the bar line if needed.
 */
function writeNote(ctx: StaffContext, at: Position, pitches: Pitch[], duration: Duration, tieToNext: boolean): Fail | null {
  const ts = ctx.copy.timeSignature;
  const length = ctx.lengths[at.measure];
  const items = readItems(ctx.staff, at.measure);
  const ticks = durationTicks(duration);
  const group = groupAt(items, at.tick);

  if (duration.triplet) {
    if (group) {
      // Into an existing group: only the same kind of triplet, on one of its slots.
      if (group.unit !== ticks) return fail('triplet-mismatch');
      group.slots[(at.tick - group.start) / group.unit] = noteOf(pitches, duration, tieToNext);
      writeItems(ctx, at.measure, items);
      return null;
    }
    // A new group starts on a beat (in 2/2 on a quarter) and must fit into the measure.
    const grid = Math.min(beatLength(ts), 48);
    if (at.tick % grid !== 0) return fail('triplet-position');
    if (at.tick + 3 * ticks > length) return fail('does-not-fit');
    const unit = ticks as 16 | 32;
    const kept = clearSpan(items, at.tick, at.tick + 3 * unit);
    kept.push({ type: 'group', start: at.tick, unit, slots: [noteOf(pitches, duration, tieToNext), null, null] });
    writeItems(ctx, at.measure, kept);
    return null;
  }

  // A plain or dotted value may not start in the middle of a triplet group.
  if (group && group.start !== at.tick) return fail('inside-triplet');

  if (at.tick + ticks <= length) {
    const kept = clearSpan(items, at.tick, at.tick + ticks);
    kept.push({ type: 'note', start: at.tick, event: noteOf(pitches, duration, tieToNext) });
    writeItems(ctx, at.measure, kept);
    return null;
  }

  // Longer than the rest of the measure: tied into the next measure(s).
  const available = ctx.lengths.slice(at.measure).reduce((sum, l) => sum + l, 0) - at.tick;
  if (ticks > available) return fail('does-not-fit'); // no new measures are made
  let remaining = ticks;
  let measure = at.measure;
  let start = at.tick;
  while (remaining > 0) {
    const end = Math.min(ctx.lengths[measure], start + remaining);
    const pieces = splitIntoValues(start, end, ts);
    const kept = clearSpan(readItems(ctx.staff, measure), start, end);
    remaining -= end - start;
    pieces.forEach((piece, i) => {
      const last = remaining === 0 && i === pieces.length - 1;
      kept.push({ type: 'note', start: piece.start, event: noteOf(pitches.map((p) => ({ ...p })), piece.duration, last ? tieToNext : true) });
    });
    writeItems(ctx, measure, kept);
    measure++;
    start = 0;
  }
  return null;
}

/** Can this pitch be entered on this staff (the instrument's range and an octave more)? */
function inEntryRange(score: Score, module: ModuleConfig, staff: number, pitch: Pitch): boolean {
  const range = entryRange(module, partOfStaff(score, staff));
  const midi = pitchToMidi(pitch);
  return midi >= range.low && midi <= range.high;
}

function chordsAllowed(score: Score, staff: number): boolean {
  return instrumentById(partOfStaff(score, staff)?.instrument ?? '')?.chords === true;
}

function checkPitches(score: Score, module: ModuleConfig, staff: number, pitches: Pitch[]): Fail | null {
  if (pitches.length !== 1 && !chordsAllowed(score, staff)) return fail('chords-not-allowed');
  return pitches.every((p) => inEntryRange(score, module, staff, p)) ? null : fail('out-of-range');
}

/** Pitches of a chord sorted from low to high, without doubles. */
export function sortPitches(pitches: Pitch[]): Pitch[] {
  const sorted = [...pitches].sort((a, b) => pitchToMidi(a) - pitchToMidi(b) || a.alter - b.alter);
  return sorted.filter((p, i) => i === 0 || !samePitch(p, sorted[i - 1]));
}

/**
 * Sets a note at the cursor (on a rest or a note), overwriting what is there and what
 * follows within its length. The pitches are taken as they are (the caller applies the key).
 */
export function writeNoteAt(score: Score, module: ModuleConfig, at: Position, pitches: Pitch[], duration: Duration): EditResult {
  if (!isAllowedDuration(module, score.timeSignature, duration)) return fail('duration-not-allowed');
  const pitchError = checkPitches(score, module, at.staff, pitches);
  if (pitchError) return pitchError;
  const ctx = context(score, at);
  if (!ctx || !isWritable(ctx.staff, at)) return fail('invalid-position');
  if (durationTicks(duration) > ctx.lengths[at.measure] - at.tick && !module.ties) return fail('does-not-fit');
  const error = writeNote(ctx, at, sortPitches(pitches).map((p) => ({ ...p })), duration, false);
  return error ?? done(ctx);
}

/** The note at a position (with its index in the staff's events), or null. */
function noteAt(ctx: StaffContext, at: Position): { index: number; note: NoteEvent } | null {
  const events = staffEvents(ctx.staff);
  const index = indexAt(events, at);
  const event = events[index]?.event;
  return event?.kind === 'note' ? { index, note: event } : null;
}

/** Removes the note at a position: its time becomes rest. */
function removeNote(ctx: StaffContext, at: Position): void {
  const items = readItems(ctx.staff, at.measure);
  const group = groupAt(items, at.tick);
  const kept = group
    ? items.map((item) =>
        item === group ? { ...group, slots: group.slots.map((s, i) => (i === (at.tick - group.start) / group.unit ? null : s)) } : item,
      )
    : items.filter((item) => !(item.type === 'note' && item.start === at.tick));
  writeItems(ctx, at.measure, kept);
}

/** Deletes the note at the cursor: it becomes rest, nothing moves. */
export function deleteNoteAt(score: Score, at: Position): EditResult {
  const ctx = context(score, at);
  if (!ctx) return fail('invalid-position');
  if (!noteAt(ctx, at)) return fail('no-note');
  removeNote(ctx, at);
  return done(ctx);
}

/**
 * Changes the value of the note at the cursor. Shorter: the rest of its time becomes
 * rest. Longer: it overwrites what follows (tied over the bar line if needed; at the
 * end of the piece nothing changes). A triplet note can only become a plain value at
 * the start of its group (the whole group is then overwritten).
 */
export function changeNoteDuration(score: Score, module: ModuleConfig, at: Position, duration: Duration): EditResult {
  if (!isAllowedDuration(module, score.timeSignature, duration)) return fail('duration-not-allowed');
  const ctx = context(score, at);
  if (!ctx) return fail('invalid-position');
  const found = noteAt(ctx, at);
  if (!found) return fail('no-note');
  const { note } = found;
  if (durationTicks(duration) > ctx.lengths[at.measure] - at.tick && !module.ties) return fail('does-not-fit');
  if (note.duration.triplet && !duration.triplet) {
    const group = groupAt(readItems(ctx.staff, at.measure), at.tick);
    if (group && group.start !== at.tick) return fail('inside-triplet');
  }
  removeNote(ctx, at);
  const error = writeNote(ctx, at, note.pitches, duration, note.tieToNext === true);
  return error ?? done(ctx);
}

/**
 * Gives one tone of the note at the cursor (in a chord: the tone with this index)
 * a new pitch; the same tone in the notes tied to it changes along, so ties stay.
 */
function repitch(score: Score, module: ModuleConfig, at: Position, tone: number, pitch: (old: Pitch) => Pitch): EditResult {
  const ctx = context(score, at);
  if (!ctx) return fail('invalid-position');
  const events = staffEvents(ctx.staff);
  const index = indexAt(events, at);
  const first = events[index]?.event;
  if (first?.kind !== 'note' || !first.pitches[tone]) return fail('no-note');
  const old = first.pitches[tone];
  const newPitch = pitch(old);
  if (!inEntryRange(score, module, at.staff, newPitch)) return fail('out-of-range');
  if (first.pitches.some((p, i) => i !== tone && samePitch(p, newPitch))) return fail('duplicate-tone');
  for (const i of tieChain(events, index)) {
    const event = events[i].event;
    if (event.kind !== 'note') continue;
    const k = i === index ? tone : event.pitches.findIndex((p) => samePitch(p, old));
    if (k < 0) continue;
    event.pitches = sortPitches(event.pitches.map((p, j) => (j === k ? { ...newPitch } : p)));
  }
  return done(ctx);
}

/** Moves a note (in a chord: one tone) to a new pitch; tied notes move along. */
export function changeNotePitch(score: Score, module: ModuleConfig, at: Position, pitch: Pitch, tone = 0): EditResult {
  return repitch(score, module, at, tone, () => pitch);
}

/** Sharp (+1), flat (-1) or natural (0) for a note (in a chord: one tone) and the notes tied to it. */
export function setAccidental(score: Score, module: ModuleConfig, at: Position, alter: -1 | 0 | 1, tone = 0): EditResult {
  if (alter !== 0 && !module.accidentals.includes(alter)) return fail('not-allowed');
  return repitch(score, module, at, tone, (old) => ({ ...old, alter }));
}

/** Adds a tone to the note at the cursor (a chord; only where the instrument allows chords). */
export function addChordTone(score: Score, module: ModuleConfig, at: Position, pitch: Pitch): EditResult {
  if (!chordsAllowed(score, at.staff)) return fail('chords-not-allowed');
  if (!inEntryRange(score, module, at.staff, pitch)) return fail('out-of-range');
  const ctx = context(score, at);
  if (!ctx) return fail('invalid-position');
  const found = noteAt(ctx, at);
  if (!found) return fail('no-note');
  if (found.note.pitches.some((p) => samePitch(p, pitch))) return fail('duplicate-tone');
  found.note.pitches = sortPitches([...found.note.pitches, { ...pitch }]);
  return done(ctx);
}

/** Removes one tone of a chord; if it is the last tone, the note becomes rest. */
export function removeChordTone(score: Score, at: Position, tone: number): EditResult {
  const ctx = context(score, at);
  if (!ctx) return fail('invalid-position');
  const found = noteAt(ctx, at);
  if (!found || !found.note.pitches[tone]) return fail('no-note');
  if (found.note.pitches.length === 1) return deleteNoteAt(score, at);
  found.note.pitches = found.note.pitches.filter((_, i) => i !== tone);
  return done(ctx);
}

/**
 * Switches the tie from the note at the cursor to the next note on or off. A tie needs
 * a next note with the same pitch (also over the bar line).
 */
export function setTie(score: Score, module: ModuleConfig, at: Position, on: boolean): EditResult {
  if (!module.ties) return fail('not-allowed');
  const ctx = context(score, at);
  if (!ctx) return fail('invalid-position');
  const events = staffEvents(ctx.staff);
  const index = indexAt(events, at);
  const event = events[index]?.event;
  if (event?.kind !== 'note') return fail('no-note');
  if (!on) {
    delete event.tieToNext;
    return done(ctx);
  }
  const next = events[index + 1]?.event;
  if (next?.kind !== 'note' || !next.pitches.some((p) => event.pitches.some((q) => samePitch(p, q)))) {
    return fail('no-matching-note');
  }
  event.tieToNext = true;
  return done(ctx);
}

/**
 * Is the cursor on a rest (at its start or inside it, see writeNoteAt)? Then a value
 * chosen in the toolbar only shows how the rest is split (see restPreview).
 */
export function isOnRest(score: Score, at: Position): boolean {
  const staff = allStaves(score)[at.staff];
  if (!staff?.measures[at.measure] || !isWritable(staff, at)) return false;
  return noteAtPosition(staff, at) === null;
}

function noteAtPosition(staff: Staff, at: Position): NoteEvent | null {
  const events = staffEvents(staff);
  const event = events[indexAt(events, at)]?.event;
  return event?.kind === 'note' ? event : null;
}

/**
 * How a rest looks when a value is chosen on it (only for drawing, never saved):
 * a whole-measure rest with "quarter" chosen becomes quarter, quarter, half rest,
 * with the chosen part starting at the cursor. Only if the value fits into the rests
 * up to the next note; otherwise null (the note will overwrite when it is set).
 */
export function restPreview(score: Score, module: ModuleConfig, at: Position, duration: Duration): Score | null {
  if (!isOnRest(score, at)) return null;
  const staff = allStaves(score)[at.staff];
  const ticks = durationTicks(duration);
  const items = readItems(staff, at.measure);
  const group = groupAt(items, at.tick);
  if (group) return group.unit === ticks ? score : null; // the slot already has this value
  const nextNote = items.map((item) => item.start).filter((start) => start > at.tick);
  const gapEnd = Math.min(measureLengths(score.timeSignature, score.pickup, staff.measures.length)[at.measure], ...nextNote);
  if (at.tick + (duration.triplet ? 3 * ticks : ticks) > gapEnd) return null;
  const written = writeNoteAt(score, module, at, [parsePitch(module.range.low)], duration);
  if (!written.ok) return null;
  const measure = allStaves(written.score)[at.staff].measures[at.measure];
  let start = 0;
  allStaves(written.score)[at.staff].measures[at.measure] = measure.map((event) => {
    const here = start === at.tick;
    start += durationTicks(event.duration);
    return here && event.kind === 'note' ? { kind: 'rest', duration: event.duration, auto: true } : event;
  });
  return written.score;
}
