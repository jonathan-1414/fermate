import { describe as group, expect, it } from 'vitest';
import { voll } from '../modules/voll';
import { describe, ok, p } from '../test/helpers';
import { plain } from './duration';
import { octaveAt, octaveRange } from './octave';
import { setTie, writeNoteAt } from './overwrite';
import { rangeBetween } from './range';
import { createEmptyScore } from './score';
import { createConfiguredScore } from './setup';
import type { Score } from './types';

const Q = plain(48);
const at = (measure: number, tick: number, staff = 0) => ({ staff, measure, tick });
const note = (score: Score, measure: number, tick: number, pitches: string[], staff = 0) =>
  ok(writeNoteAt(score, voll, at(measure, tick, staff), pitches.map(p), Q));
const m = (score: Score, measure = 0, staff = 0) => describe(score.parts.flatMap((part) => part.staves)[staff].measures[measure]);

function trombone(): Score {
  return ok(createConfiguredScore(voll, { instruments: ['trombone'], timeSignature: '4/4', keySignature: 0, pickup: 0, tempo: 90 }));
}

group('Oktave ↑ / ↓', () => {
  it('moves the selected note an octave, accidentals stay', () => {
    const score = note(trombone(), 0, 0, ['F#4']);
    expect(m(ok(octaveAt(score, voll, at(0, 0), -1)))[0]).toBe('n48@0 F#3');
    expect(m(ok(octaveAt(score, voll, at(0, 0), 1)))[0]).toBe('n48@0 F#5');
  });

  it('a whole chord moves; with a selected tone only that tone', () => {
    const score = note(createEmptyScore(voll), 0, 0, ['C4', 'E4', 'G4']);
    expect(m(ok(octaveAt(score, voll, at(0, 0), 1)))[0]).toBe('n48@0 C5+E5+G5');
    expect(m(ok(octaveAt(score, voll, at(0, 0), 1, 0)))[0]).toBe('n48@0 E4+G4+C5');
    const octave = note(createEmptyScore(voll), 0, 0, ['C4', 'C5']);
    expect(octaveAt(octave, voll, at(0, 0), 1, 0)).toEqual({ ok: false, error: 'duplicate-tone' });
  });

  it('notes tied to the moved note move along', () => {
    const tied = ok(setTie(note(note(trombone(), 0, 144, ['C4']), 1, 0, ['C4']), voll, at(0, 144), true));
    const moved = ok(octaveAt(tied, voll, at(1, 0), -1));
    expect(m(moved, 0).at(-1)).toBe('n48@144 C3~');
    expect(m(moved, 1)[0]).toBe('n48@0 C3');
  });

  it('a marking moves all its notes, also beyond the instrument\'s range', () => {
    const score = note(note(trombone(), 0, 0, ['E5']), 0, 48, ['F5']);
    const range = rangeBetween(score, at(0, 0), at(0, 48));
    const once = ok(octaveRange(score, voll, range, -1));
    expect(m(once).slice(0, 2)).toEqual(['n48@0 E4', 'n48@48 F4']);
    const twice = ok(octaveRange(once, voll, range, -1));
    expect(m(twice).slice(0, 2)).toEqual(['n48@0 E3', 'n48@48 F3']);
  });

  it('nothing changes if one tone would leave the piano keyboard', () => {
    const score = note(note(createEmptyScore(voll), 0, 0, ['C4']), 0, 48, ['B0'], 0);
    const range = rangeBetween(score, at(0, 0), at(0, 48));
    expect(octaveRange(score, voll, range, -1)).toEqual({ ok: false, error: 'out-of-range' });
    expect(octaveAt(score, voll, at(0, 48), -1)).toEqual({ ok: false, error: 'out-of-range' });
  });

  it('a rest or a marking without notes: nothing changes', () => {
    const score = trombone();
    expect(octaveAt(score, voll, at(0, 0), 1)).toEqual({ ok: false, error: 'no-note' });
    expect(octaveRange(score, voll, rangeBetween(score, at(0, 0), at(1, 0)), 1)).toEqual({ ok: false, error: 'no-note' });
  });
});
