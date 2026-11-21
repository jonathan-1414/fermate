import type { ModuleConfig } from '../modules/types';
import { eventTicks } from './duration';
import type { EditResult } from './edit';
import { fromItems, itemEnd, type Item, toItems } from './items';
import { isValidPickup, measureLengths } from './meter';
import { cleanTies } from './sequence';
import { allStaves } from './staves';
import type { Score, ScoreEvent, TimeSignature } from './types';
import { parseTimeSignature } from './score';

/**
 * Measures, pickup and time signature in the full version. Every change applies to
 * all staves at once. Pure functions: they return a new score or the reason why not.
 */

type Fail = Extract<EditResult, { ok: false }>;
const fail = (error: Fail['error']): Fail => ({ ok: false, error });

function readItems(measure: ScoreEvent[]): Item[] {
  const items = toItems(measure);
  if (!items) throw new Error('Broken measure');
  return items;
}

/**
 * Brings a measure to a new length. 'start': it is cut or filled at the end (the
 * last measure). 'end': the notes keep their place before the end (the pickup leads
 * into the first measure), it is cut or filled at the front. Notes and triplet groups
 * that no longer fit disappear.
 */
function resize(measure: ScoreEvent[], length: number, keep: 'start' | 'end', ts: TimeSignature): ScoreEvent[] {
  const oldLength = measure.reduce((sum, e) => sum + eventTicks(e), 0);
  const shift = keep === 'end' ? length - oldLength : 0;
  const items = readItems(measure)
    .map((item) => ({ ...item, start: item.start + shift }))
    .filter((item) => item.start >= 0 && itemEnd(item) <= length);
  return fromItems(items, length, ts);
}

/** Makes every measure of every staff as long as it should be (after a change of count or pickup). */
function fitLengths(score: Score, keepFirst: 'start' | 'end'): void {
  for (const staff of allStaves(score)) {
    const lengths = measureLengths(score.timeSignature, score.pickup, staff.measures.length);
    staff.measures = staff.measures.map((measure, i) => resize(measure, lengths[i], i === 0 ? keepFirst : 'start', score.timeSignature));
    cleanTies(staff);
  }
}

function measureCount(score: Score): number {
  return allStaves(score)[0].measures.length;
}

/** Inserts an empty measure after the measure `after` (in all staves). */
export function insertMeasure(score: Score, module: ModuleConfig, after: number): EditResult {
  const count = measureCount(score);
  if (after < 0 || after >= count) return fail('invalid-position');
  if (count >= module.maxMeasures) return fail('too-many-measures');
  const copy = structuredClone(score);
  for (const staff of allStaves(copy)) staff.measures.splice(after + 1, 0, []);
  fitLengths(copy, 'end');
  return { ok: true, score: copy };
}

/**
 * Deletes a measure with its notes (in all staves). Deleting the pickup measure
 * switches the pickup off.
 */
export function deleteMeasure(score: Score, module: ModuleConfig, index: number): EditResult {
  const count = measureCount(score);
  if (index < 0 || index >= count) return fail('invalid-position');
  if (score.pickup > 0 && index === 0) return setPickup(score, module, 0);
  const minimum = Math.max(module.minMeasures, score.pickup > 0 ? 2 : 1);
  if (count - 1 < minimum) return fail('too-few-measures');
  const copy = structuredClone(score);
  for (const staff of allStaves(copy)) staff.measures.splice(index, 1);
  fitLengths(copy, 'end');
  return { ok: true, score: copy };
}

/**
 * Switches the pickup on or off or changes its length (in ticks, 0 = none).
 * On: an empty pickup measure comes before measure 1. Off: the pickup measure goes,
 * with its notes. The last measure is shortened or filled at the end.
 */
export function setPickup(score: Score, module: ModuleConfig, pickup: number): EditResult {
  if (!module.pickup && pickup !== 0) return fail('not-allowed');
  if (!isValidPickup(score.timeSignature, pickup)) return fail('invalid-pickup');
  if (pickup === score.pickup) return { ok: true, score };
  const copy = structuredClone(score);
  const count = measureCount(copy);
  if (score.pickup === 0) {
    if (count >= module.maxMeasures) return fail('too-many-measures');
    for (const staff of allStaves(copy)) staff.measures.unshift([]);
  } else if (pickup === 0) {
    if (count - 1 < module.minMeasures) return fail('too-few-measures');
    for (const staff of allStaves(copy)) staff.measures.shift();
  }
  copy.pickup = pickup;
  fitLengths(copy, 'end');
  return { ok: true, score: copy };
}

/** The time signature can only be changed while the score has no notes. */
export function setTimeSignature(score: Score, module: ModuleConfig, text: string): EditResult {
  if (!module.timeSignatures.includes(text)) return fail('not-allowed');
  const hasNotes = allStaves(score).some((staff) => staff.measures.some((m) => m.some((e) => e.kind === 'note')));
  if (hasNotes) return fail('not-empty');
  const copy = structuredClone(score);
  copy.timeSignature = parseTimeSignature(text);
  if (!isValidPickup(copy.timeSignature, copy.pickup)) copy.pickup = 0;
  for (const staff of allStaves(copy)) {
    const lengths = measureLengths(copy.timeSignature, copy.pickup, staff.measures.length);
    staff.measures = lengths.map((length) => fromItems([], length, copy.timeSignature));
  }
  return { ok: true, score: copy };
}

/** Changes the key; the notes keep their pitches (from f sharp in G major becomes f sharp with a sign). */
export function setKeySignature(score: Score, module: ModuleConfig, keySignature: number): EditResult {
  if (!module.keySignatures.includes(keySignature)) return fail('not-allowed');
  return { ok: true, score: { ...structuredClone(score), keySignature } };
}
