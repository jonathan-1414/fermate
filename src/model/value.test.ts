import { describe, expect, it } from 'vitest';
import { voll } from '../modules/voll';
import { ok, p } from '../test/helpers';
import { plain } from './duration';
import { setPickup, setTimeSignature } from './measures';
import { writeNoteAt } from './overwrite';
import { createEmptyScore } from './score';
import { nextPosition } from './sequence';
import type { Duration, Score } from './types';
import { isWholeMeasureRest, leftTripletGroup, valueAfterWriting } from './value';

const Q = plain(48);
const triplet = (base: 48 | 24): Duration => ({ base, dotted: false, triplet: true });
const dotted = (base: 96 | 48 | 24): Duration => ({ base, dotted: true, triplet: false });
const at = (measure: number, tick: number) => ({ staff: 0, measure, tick });
const write = (score: Score, measure: number, tick: number, d: Duration) =>
  ok(writeNoteAt(score, voll, at(measure, tick), [p('C4')], d));

describe('whole-measure rest', () => {
  it('is the rest of an empty measure, in every time signature', () => {
    for (const meter of ['4/4', '3/4', '2/4', '6/8', '2/2']) {
      const base = createEmptyScore(voll);
      const score = meter === '4/4' ? base : ok(setTimeSignature(base, voll, meter));
      expect(isWholeMeasureRest(score, at(0, 0))).toBe(true);
    }
  });

  it('is gone as soon as the measure has a note', () => {
    const score = write(createEmptyScore(voll), 0, 0, Q);
    expect(isWholeMeasureRest(score, at(0, 0))).toBe(false);
    expect(isWholeMeasureRest(score, at(0, 96))).toBe(false);
    expect(isWholeMeasureRest(score, at(1, 0))).toBe(true);
  });

  it('a pickup measure has no whole-measure rest', () => {
    const score = ok(setPickup(createEmptyScore(voll), voll, 48));
    expect(isWholeMeasureRest(score, at(0, 0))).toBe(false);
  });
});

describe('triplet group written to its end', () => {
  it('stays in the group after the first and second note, leaves it after the third', () => {
    let score = write(createEmptyScore(voll), 0, 0, triplet(24));
    expect(leftTripletGroup(score, at(0, 0), nextPosition(score, at(0, 0)))).toBe(false);
    score = write(score, 0, 16, triplet(24));
    expect(leftTripletGroup(score, at(0, 16), nextPosition(score, at(0, 16)))).toBe(false);
    score = write(score, 0, 32, triplet(24));
    expect(leftTripletGroup(score, at(0, 32), nextPosition(score, at(0, 32)))).toBe(true);
  });

  it('a note outside a group has no group to stay in', () => {
    const score = write(createEmptyScore(voll), 0, 0, Q);
    expect(leftTripletGroup(score, at(0, 0), at(0, 48))).toBe(true);
  });
});

describe('value after writing', () => {
  it('a dot from "Punkt" counts for one note only', () => {
    expect(valueAfterWriting(dotted(48), true, true)).toEqual(Q);
  });

  it('a dot taken from a tapped dotted rest stays the value to write with', () => {
    expect(valueAfterWriting(dotted(48), false, true)).toEqual(dotted(48));
  });

  it('a triplet stays until its group is written, then ends', () => {
    expect(valueAfterWriting(triplet(24), false, false)).toEqual(triplet(24));
    expect(valueAfterWriting(triplet(24), false, true)).toEqual(plain(24));
  });

  it('plain values stay as they are', () => {
    expect(valueAfterWriting(Q, false, true)).toEqual(Q);
  });
});
