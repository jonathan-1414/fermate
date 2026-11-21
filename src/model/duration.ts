import type { BaseValue, Duration, ScoreEvent } from './types';

const BASE_VALUES: BaseValue[] = [192, 96, 48, 24, 12];

export function isBaseValue(ticks: number): ticks is BaseValue {
  return (BASE_VALUES as number[]).includes(ticks);
}

/** A plain note value (not dotted, no triplet) from its length in ticks. */
export function plain(ticks: number): Duration {
  if (!isBaseValue(ticks)) throw new Error(`No plain note value for ${ticks} ticks`);
  return { base: ticks, dotted: false, triplet: false };
}

/** Length in ticks: dotted = 1.5 times, triplet = 2/3 (three in the time of two). */
export function durationTicks(d: Duration): number {
  if (d.dotted) return (d.base * 3) / 2;
  if (d.triplet) return (d.base * 2) / 3;
  return d.base;
}

export function eventTicks(event: ScoreEvent): number {
  return durationTicks(event.duration);
}

/** Is this combination allowed at all (dot on half, quarter, eighth; triplet on quarter, eighth)? */
export function isValidDuration(d: Duration): boolean {
  if (!isBaseValue(d.base) || typeof d.dotted !== 'boolean' || typeof d.triplet !== 'boolean') return false;
  if (d.dotted && d.triplet) return false;
  if (d.dotted) return d.base === 96 || d.base === 48 || d.base === 24;
  if (d.triplet) return d.base === 48 || d.base === 24;
  return true;
}
