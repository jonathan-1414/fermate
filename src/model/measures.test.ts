import { describe, expect, it } from 'vitest';
import { voll } from '../modules/voll';
import { describe as show, ok, p } from '../test/helpers';
import { plain } from './duration';
import { deleteMeasure, insertMeasure, setKeySignature, setPickup, setTimeSignature } from './measures';
import { writeNoteAt } from './overwrite';
import { createEmptyScore } from './score';
import type { Score } from './types';

const write = (score: Score, measure: number, tick: number, pitch: string, ticks = 48) =>
  ok(writeNoteAt(score, voll, { staff: 0, measure, tick }, [p(pitch)], plain(ticks)));
const measures = (score: Score) => score.parts[0].staves[0].measures.map((m) => show(m));
const fail = (error: string) => ({ ok: false, error });

describe('inserting and deleting measures', () => {
  it('inserts an empty measure after the chosen one', () => {
    const score = ok(insertMeasure(write(createEmptyScore(voll), 1, 0, 'D4'), voll, 0));
    expect(measures(score).slice(0, 3)).toEqual([['r192@0'], ['r192@0'], ['n48@0 D4', 'r48@48', 'r96@96']]);
    expect(measures(score)).toHaveLength(9);
  });

  it('deletes a measure with its notes', () => {
    const score = ok(deleteMeasure(write(createEmptyScore(voll), 1, 0, 'D4'), voll, 1));
    expect(measures(score)).toEqual(Array(7).fill(['r192@0']));
  });

  it('keeps between 1 and 32 measures', () => {
    let score = createEmptyScore(voll);
    while (measures(score).length < 32) score = ok(insertMeasure(score, voll, 0));
    expect(insertMeasure(score, voll, 0)).toEqual(fail('too-many-measures'));
    while (measures(score).length > 1) score = ok(deleteMeasure(score, voll, 0));
    expect(deleteMeasure(score, voll, 0)).toEqual(fail('too-few-measures'));
  });
});

describe('pickup', () => {
  it('switching it on adds a pickup measure before measure 1 and shortens the last measure', () => {
    const before = write(createEmptyScore(voll), 7, 144, 'G4');
    const score = ok(setPickup(before, voll, 48));
    expect(measures(score)).toHaveLength(9);
    expect(measures(score)[0]).toEqual(['r48@0']);
    expect(measures(score)[8]).toEqual(['r96@0', 'r48@96']); // the G on beat 4 is cut off
    expect(score.pickup).toBe(48);
  });

  it('a longer pickup keeps its notes at the end (they lead into measure 1)', () => {
    const score = write(ok(setPickup(createEmptyScore(voll), voll, 48)), 0, 0, 'G4');
    const longer = ok(setPickup(score, voll, 96));
    expect(measures(longer)[0]).toEqual(['r48@0', 'n48@48 G4']);
    const shorter = ok(setPickup(longer, voll, 48));
    expect(measures(shorter)[0]).toEqual(['n48@0 G4']);
    expect(measures(shorter)[8]).toEqual(['r96@0', 'r48@96']);
  });

  it('switching it off removes the pickup measure with its notes; the last measure is full again', () => {
    const score = write(ok(setPickup(createEmptyScore(voll), voll, 48)), 0, 0, 'G4');
    const off = ok(setPickup(score, voll, 0));
    expect(measures(off)).toEqual(Array(8).fill(['r192@0']));
    expect(off.pickup).toBe(0);
  });

  it('deleting the pickup measure switches the pickup off', () => {
    const score = ok(setPickup(createEmptyScore(voll), voll, 48));
    expect(ok(deleteMeasure(score, voll, 0)).pickup).toBe(0);
  });

  it('inserting after the last measure: the new one is the shortened last measure', () => {
    const score = ok(insertMeasure(ok(setPickup(createEmptyScore(voll), voll, 48)), voll, 8));
    expect(measures(score)[8]).toEqual(['r192@0']);
    expect(measures(score)[9]).toEqual(['r96@0', 'r48@96']);
  });

  it('only lengths in quarters (6/8: eighths), shorter than a measure', () => {
    expect(setPickup(createEmptyScore(voll), voll, 24)).toEqual(fail('invalid-pickup'));
    expect(setPickup(createEmptyScore(voll), voll, 192)).toEqual(fail('invalid-pickup'));
  });
});

describe('time signature and key', () => {
  it('the time signature changes only while there are no notes', () => {
    const score = ok(setTimeSignature(createEmptyScore(voll), voll, '3/4'));
    expect(score.timeSignature).toEqual({ beats: 3, beatValue: 4 });
    expect(measures(score)[0]).toEqual(['r144@0']);
    expect(setTimeSignature(write(score, 0, 0, 'C4'), voll, '4/4')).toEqual(fail('not-empty'));
    expect(setTimeSignature(score, voll, '5/4')).toEqual(fail('not-allowed'));
  });

  it('a pickup that does not fit the new time signature is dropped', () => {
    const score = ok(setPickup(createEmptyScore(voll), voll, 144));
    expect(ok(setTimeSignature(score, voll, '3/4')).pickup).toBe(0);
    expect(ok(setTimeSignature(score, voll, '6/8')).pickup).toBe(0);
  });

  it('the key changes, the notes keep their pitches', () => {
    const score = ok(setKeySignature(write(createEmptyScore(voll), 0, 0, 'F#4'), voll, 0));
    expect(measures(ok(setKeySignature(score, voll, -2)))[0][0]).toBe('n48@0 F#4');
    expect(setKeySignature(score, voll, 5)).toEqual(fail('not-allowed'));
  });
});
