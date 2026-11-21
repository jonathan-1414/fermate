import { TICKS_PER_WHOLE } from './constants';
import type { Duration, TimeSignature } from './types';

/**
 * Rules that depend on the time signature: beats, measure lengths, and how a
 * stretch of time is written as readable note or rest values.
 */

/** 6/8 (and 9/8, 12/8) is counted in dotted quarters, not in eighths. */
export function isCompound(ts: TimeSignature): boolean {
  return ts.beatValue === 8 && ts.beats % 3 === 0;
}

export function fullMeasureLength(ts: TimeSignature): number {
  return ts.beats * (TICKS_PER_WHOLE / ts.beatValue);
}

/** Length of one beat (what you count): quarter, half in 2/2, dotted quarter in 6/8. */
export function beatLength(ts: TimeSignature): number {
  const unit = TICKS_PER_WHOLE / ts.beatValue;
  return isCompound(ts) ? 3 * unit : unit;
}

/**
 * Lengths of all measures. With a pickup, the first measure is the pickup and the
 * last measure is shortened so that both together make one full measure.
 */
export function measureLengths(ts: TimeSignature, pickup: number, count: number): number[] {
  const full = fullMeasureLength(ts);
  return Array.from({ length: count }, (_, i) => {
    if (pickup > 0 && i === 0) return pickup;
    if (pickup > 0 && i === count - 1) return full - pickup;
    return full;
  });
}

/** Unit in which a pickup is measured: quarters, in 6/8 eighths. */
export function pickupUnit(ts: TimeSignature): number {
  return isCompound(ts) ? TICKS_PER_WHOLE / ts.beatValue : TICKS_PER_WHOLE / 4;
}

export function isValidPickup(ts: TimeSignature, pickup: number): boolean {
  if (pickup === 0) return true;
  return pickup > 0 && pickup < fullMeasureLength(ts) && pickup % pickupUnit(ts) === 0;
}

const DURATION_OF_TICKS: Record<number, Duration> = {
  192: { base: 192, dotted: false, triplet: false },
  144: { base: 96, dotted: true, triplet: false },
  96: { base: 96, dotted: false, triplet: false },
  72: { base: 48, dotted: true, triplet: false },
  48: { base: 48, dotted: false, triplet: false },
  36: { base: 24, dotted: true, triplet: false },
  24: { base: 24, dotted: false, triplet: false },
  12: { base: 12, dotted: false, triplet: false },
};

/** A single (not triplet) note value of exactly this length, or null if there is none. */
export function durationOfTicks(ticks: number): Duration | null {
  const d = DURATION_OF_TICKS[ticks];
  return d ? { ...d } : null;
}

export interface Piece {
  start: number;
  duration: Duration;
}

/**
 * Writes the stretch from `start` to `end` of a measure as readable values that
 * show the beats: used for automatic rests and for the parts of a note that is
 * tied over the bar line. Examples in 4/4: from beat 2 to the end → quarter, half
 * (never a rest over the middle of the measure); after a dotted quarter → eighth,
 * half. In 6/8: dotted quarters per half measure, no value crosses a beat.
 */
export function splitIntoValues(start: number, end: number, ts: TimeSignature): Piece[] {
  const pieces: Piece[] = [];
  const beat = beatLength(ts);
  const compound = isCompound(ts);
  let pos = start;
  while (pos < end) {
    const remaining = end - pos;
    const ticks = compound ? compoundValue(pos, remaining, beat) : simpleValue(pos, remaining);
    pieces.push({ start: pos, duration: durationOfTicks(ticks)! });
    pos += ticks;
  }
  return pieces;
}

/** Simple time: the largest value that fits and starts on a multiple of itself. */
function simpleValue(pos: number, remaining: number): number {
  for (const v of [192, 96, 48, 24, 12]) if (v <= remaining && pos % v === 0) return v;
  throw new Error(`Cannot write ${remaining} ticks at ${pos}`);
}

/** Compound time (6/8): dotted quarter on the beat, otherwise values within the beat. */
function compoundValue(pos: number, remaining: number, beat: number): number {
  const inBeat = pos % beat;
  const fitsBeat = (v: number) => v <= remaining && inBeat + v <= beat;
  if (inBeat === 0 && fitsBeat(beat)) return beat;
  for (const v of [48, 24]) if (fitsBeat(v) && pos % 24 === 0) return v;
  if (fitsBeat(12) && pos % 12 === 0) return 12;
  throw new Error(`Cannot write ${remaining} ticks at ${pos}`);
}
