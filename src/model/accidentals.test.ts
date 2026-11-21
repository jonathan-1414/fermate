import { describe, expect, it } from 'vitest';
import { voll } from '../modules/voll';
import { ok, p } from '../test/helpers';
import { plain } from './duration';
import { accidentalsForStaff, inKey, keyAlter } from './accidentals';
import { setKeySignature } from './measures';
import { setTie, writeNoteAt } from './overwrite';
import { createEmptyScore } from './score';
import type { Score } from './types';

const Q = plain(48);
const write = (score: Score, measure: number, tick: number, pitch: string) =>
  ok(writeNoteAt(score, voll, { staff: 0, measure, tick }, [p(pitch)], Q));
const signs = (score: Score) =>
  accidentalsForStaff(score.parts[0].staves[0], score.keySignature).map((m) => m.map((e) => e[0] ?? null));

describe('key signature', () => {
  it('knows which steps the key changes', () => {
    expect(keyAlter('F', 1)).toBe(1); // G major: f sharp
    expect(keyAlter('C', 1)).toBe(0);
    expect(keyAlter('C', 2)).toBe(1); // D major
    expect(keyAlter('B', -1)).toBe(-1); // F major: b flat
    expect(keyAlter('E', -1)).toBe(0);
    expect(keyAlter('A', -4)).toBe(-1); // A flat major
    expect(keyAlter('G', -4)).toBe(0);
  });

  it('new notes follow the key', () => {
    expect(inKey(p('F4'), 1)).toEqual(p('F#4'));
    expect(inKey(p('B4'), -1)).toEqual(p('Bb4'));
    expect(inKey(p('F#4'), 0)).toEqual(p('F4'));
  });
});

describe('which notes get a sign', () => {
  it('a sign holds until the end of the measure; after it, a natural', () => {
    let score = createEmptyScore(voll);
    score = write(write(write(score, 0, 0, 'F#4'), 0, 48, 'F#4'), 0, 96, 'F4');
    score = write(score, 1, 0, 'F#4');
    expect(signs(score)).toEqual([['sharp', null, 'natural', null], ['sharp', null, null], ...Array(6).fill([null])]);
  });

  it('in the key no sign; against the key a natural', () => {
    let score = ok(setKeySignature(createEmptyScore(voll), voll, 1));
    score = write(write(score, 0, 0, 'F#4'), 0, 48, 'F4');
    expect(signs(score)[0]).toEqual([null, 'natural', null]);
  });

  it('only for the same line: f sharp in another octave needs its own sign', () => {
    const score = write(write(createEmptyScore(voll), 0, 0, 'F#4'), 0, 48, 'F#5');
    expect(signs(score)[0]).toEqual(['sharp', 'sharp', null]);
  });

  it('a note tied over the bar line gets no sign, the next one in that measure does', () => {
    let score = write(write(write(createEmptyScore(voll), 0, 144, 'F#4'), 1, 0, 'F#4'), 1, 48, 'F#4');
    score = ok(setTie(score, voll, { staff: 0, measure: 0, tick: 144 }, true));
    expect(signs(score).slice(0, 2)).toEqual([[null, null, 'sharp'], [null, 'sharp', null]]);
  });
});
