import type { ModuleConfig } from '../modules/types';
import { buildMeasure, isOccupant, measureLength, placeEvents } from './measure';
import { eventTicks, plain } from './duration';
import { isInRange } from './pitch';
import { allStaves, staffAt } from './staves';
import type { Pitch, Position, Score, ScoreEvent } from './types';

/**
 * Modul 1's editing rules: notes in a measure stand together from the start and the
 * free space stays at the end. Note values are plain values given in ticks. The full
 * version gets its own overwriting functions (CLAUDE.md, section 8, step 2).
 *
 * All edit functions are pure: they never change the given score,
 * they return a new one (or the reason why the edit is not allowed).
 */
export type EditError =
  | 'invalid-position' // staff or measure does not exist, or the tick lies inside a note
  | 'duration-not-allowed' // note value not in this module
  | 'out-of-range' // pitch outside the module's range
  | 'does-not-fit' // note would go past the end of the measure
  | 'no-note' // there is no note at this position
  | 'no-event' // there is no note or set rest at this position
  | 'rests-not-allowed' // this module (or link) does not allow setting rests
  // Full version (overwrite.ts, measures.ts):
  | 'triplet-mismatch' // another kind of triplet is already there
  | 'triplet-position' // a triplet group must start on a beat
  | 'inside-triplet' // a plain value cannot start in the middle of a triplet group
  | 'chords-not-allowed' // more than one pitch where chords are not allowed
  | 'no-matching-note' // a tie needs a next note with the same pitch
  | 'not-allowed' // the module does not have this feature
  | 'not-empty' // only possible while the score has no notes
  | 'invalid-pickup' // pickup length not possible in this time signature
  | 'too-many-measures'
  | 'too-few-measures';

export type EditResult = { ok: true; score: Score } | { ok: false; error: EditError };

function fail(error: EditError): EditResult {
  return { ok: false, error };
}

function getMeasure(score: Score, at: Position): ScoreEvent[] | undefined {
  return staffAt(score, at.staff)?.measures[at.measure];
}

function withMeasure(score: Score, at: Position, measure: ScoreEvent[]): Score {
  const copy = structuredClone(score);
  allStaves(copy)[at.staff].measures[at.measure] = measure;
  return copy;
}

/** The user's events of a measure (notes and set rests), in order, without gaps. */
function occupantsOf(measure: ScoreEvent[]): ScoreEvent[] {
  return measure.filter(isOccupant);
}

/** Packs events from the start of the measure; the free space at the end becomes a gap. */
function packed(events: ScoreEvent[], length: number): ScoreEvent[] {
  let start = 0;
  const placed = events.map((event) => {
    const p = { start, event };
    start += eventTicks(event);
    return p;
  });
  return buildMeasure(placed, length);
}

/**
 * Where a new event goes in the row of events: replacing the one that starts at
 * `tick`, or appended after the last one (any tick in the free space at the end).
 * Null if the tick lies inside an event.
 */
function slotAt(events: ScoreEvent[], tick: number): { index: number; replace: boolean } | null {
  let start = 0;
  for (let index = 0; index < events.length; index++) {
    if (start === tick) return { index, replace: true };
    start += eventTicks(events[index]);
    if (tick < start) return null;
  }
  return tick >= start ? { index: events.length, replace: false } : null;
}

/** The row of events after putting `event` at `tick`, or null if that is not a slot. */
function withEventAt(events: ScoreEvent[], tick: number, event: ScoreEvent): ScoreEvent[] | null {
  const slot = slotAt(events, tick);
  if (!slot) return null;
  const result = [...events];
  result.splice(slot.index, slot.replace ? 1 : 0, event);
  return result;
}

const totalTicks = (events: ScoreEvent[]) => events.reduce((sum, e) => sum + eventTicks(e), 0);

/** Can a note of this value be placed here (does everything still fit into the measure)? */
export function canPlace(score: Score, module: ModuleConfig, at: Position, ticks: number): boolean {
  const measure = getMeasure(score, at);
  if (!module.durations.includes(ticks) || !measure) return false;
  const placeholder: ScoreEvent = { kind: 'rest', duration: plain(ticks), auto: false };
  const result = withEventAt(occupantsOf(measure), at.tick, placeholder);
  return result !== null && totalTicks(result) <= measureLength(score.timeSignature);
}

/**
 * Places an event (note or set rest) at a spot: on an event, it replaces it and the
 * following events move along (left if shorter, right if longer); in the free space,
 * it is appended. If the events would no longer fit into the measure, nothing changes.
 */
function placeEvent(score: Score, module: ModuleConfig, at: Position, event: ScoreEvent): EditResult {
  const measure = getMeasure(score, at);
  if (!measure) return fail('invalid-position');
  if (!module.durations.includes(eventTicks(event))) return fail('duration-not-allowed');
  const events = withEventAt(occupantsOf(measure), at.tick, event);
  if (!events) return fail('invalid-position');
  const length = measureLength(score.timeSignature);
  if (totalTicks(events) > length) return fail('does-not-fit');
  return { ok: true, score: withMeasure(score, at, packed(events, length)) };
}

/**
 * Places a note. Notes in a measure always stand together from the start, like letters
 * in a word; free space is only at the end. On a note (or set rest), the new note replaces
 * it and the following events move along (left if shorter, right if longer). In the free
 * space, the note is appended. If everything would no longer fit, nothing changes.
 */
export function setNote(
  score: Score,
  module: ModuleConfig,
  at: Position,
  pitch: Pitch,
  ticks: number,
): EditResult {
  if (!getMeasure(score, at)) return fail('invalid-position');
  if (!module.durations.includes(ticks)) return fail('duration-not-allowed');
  if (!isInRange(pitch, module.range)) return fail('out-of-range');
  return placeEvent(score, module, at, { kind: 'note', pitches: [{ ...pitch }], duration: plain(ticks) });
}

/**
 * Places a rest that the user chose (shown, unlike a gap), following the same rules
 * as a note: on a note it replaces it, in the free space it is appended.
 * Only if the module (or the link) allows setting rests.
 */
export function setRest(score: Score, module: ModuleConfig, at: Position, ticks: number): EditResult {
  if (!module.manualRests) return fail('rests-not-allowed');
  if (!module.durations.includes(ticks)) return fail('duration-not-allowed');
  return placeEvent(score, module, at, { kind: 'rest', duration: plain(ticks), auto: false });
}

/** Deletes the note or set rest that starts at this position; the following events move left. */
export function deleteEvent(score: Score, at: Position): EditResult {
  const measure = getMeasure(score, at);
  if (!measure) return fail('invalid-position');
  const events = occupantsOf(measure);
  const slot = slotAt(events, at.tick);
  if (!slot?.replace) return fail('no-event');
  events.splice(slot.index, 1);
  return { ok: true, score: withMeasure(score, at, packed(events, measureLength(score.timeSignature))) };
}

/** Changes the pitch of the note that starts at this position. */
export function changePitch(score: Score, module: ModuleConfig, at: Position, pitch: Pitch): EditResult {
  const measure = getMeasure(score, at);
  if (!measure) return fail('invalid-position');
  if (!isInRange(pitch, module.range)) return fail('out-of-range');
  const index = placeEvents(measure).findIndex((p) => p.start === at.tick && p.event.kind === 'note');
  if (index < 0) return fail('no-note');

  const updated = measure.map((event, i) => (i === index ? { ...event, pitches: [{ ...pitch }] } : event));
  return { ok: true, score: withMeasure(score, at, updated) };
}

/**
 * Changes the value of the note or set rest that starts at this position; the pitch stays.
 * Shorter: it is split into events of the new value (notes with the same pitch, or rests),
 * so it keeps its place and the following events stay where they are (a quarter becomes
 * two eighths, a whole note eight eighths). Longer: the following events move right; it
 * fails if they would no longer fit into the measure.
 */
export function changeDuration(score: Score, module: ModuleConfig, at: Position, ticks: number): EditResult {
  const measure = getMeasure(score, at);
  if (!measure) return fail('invalid-position');
  const events = occupantsOf(measure);
  const slot = slotAt(events, at.tick);
  if (!slot?.replace) return fail('no-event');
  const old = events[slot.index];
  if (!module.durations.includes(ticks)) return fail('duration-not-allowed');
  const withTicks = (n: number): ScoreEvent =>
    old.kind === 'note'
      ? { kind: 'note', pitches: old.pitches.map((p) => ({ ...p })), duration: plain(n) }
      : { kind: 'rest', duration: plain(n), auto: false };
  const oldTicks = eventTicks(old);
  if (ticks >= oldTicks || oldTicks % ticks !== 0) return placeEvent(score, module, at, withTicks(ticks));
  const parts = Array.from({ length: oldTicks / ticks }, () => withTicks(ticks));
  events.splice(slot.index, 1, ...parts);
  return { ok: true, score: withMeasure(score, at, packed(events, measureLength(score.timeSignature))) };
}
