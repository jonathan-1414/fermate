import { describe, expect, it } from 'vitest';
import { durationTicks, isValidDuration, plain } from './duration';
import type { BaseValue } from './types';

const d = (base: BaseValue, dotted = false, triplet = false) => ({ base, dotted, triplet });

describe('note values', () => {
  it('computes the length in ticks', () => {
    expect([192, 96, 48, 24, 12].map((t) => durationTicks(plain(t)))).toEqual([192, 96, 48, 24, 12]);
    expect([durationTicks(d(96, true)), durationTicks(d(48, true)), durationTicks(d(24, true))]).toEqual([144, 72, 36]);
    expect([durationTicks(d(48, false, true)), durationTicks(d(24, false, true))]).toEqual([32, 16]);
  });

  it('allows dots only on half, quarter and eighth, triplets only on quarter and eighth', () => {
    expect([192, 96, 48, 24, 12].map((b) => isValidDuration(d(b as BaseValue, true)))).toEqual([
      false, true, true, true, false,
    ]);
    expect([192, 96, 48, 24, 12].map((b) => isValidDuration(d(b as BaseValue, false, true)))).toEqual([
      false, false, true, true, false,
    ]);
    expect(isValidDuration(d(48, true, true))).toBe(false);
  });

  it('has no plain value for odd lengths', () => {
    expect(() => plain(72)).toThrow();
  });
});
