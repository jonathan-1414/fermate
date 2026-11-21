import { describe, expect, it } from 'vitest';
import { voll } from '../modules/voll';
import { describe as show, ok, p } from '../test/helpers';
import { plain } from './duration';
import { addPart } from './instruments';
import { addChordTone, changeNotePitch, removeChordTone, setAccidental, setTie, writeNoteAt } from './overwrite';
import { createEmptyScore } from './score';
import type { Score } from './types';

const at = (measure: number, tick: number, staff = 0) => ({ staff, measure, tick });
const Q = plain(48);
const piano = () => ok(writeNoteAt(createEmptyScore(voll), voll, at(0, 0), [p('E4')], Q));
const m = (score: Score, measure = 0, staff = 0) => show(score.parts.flatMap((part) => part.staves)[staff].measures[measure]);

describe('chords (piano only)', () => {
  it('adds tones, sorted from low to high', () => {
    const score = ok(addChordTone(ok(addChordTone(piano(), voll, at(0, 0), p('G4'))), voll, at(0, 0), p('C4')));
    expect(m(score)[0]).toBe('n48@0 C4+E4+G4');
  });

  it('a tone that is already there is not added twice', () => {
    expect(addChordTone(piano(), voll, at(0, 0), p('E4'))).toEqual({ ok: false, error: 'duplicate-tone' });
  });

  it('no chords for other instruments', () => {
    const r = addPart(createEmptyScore(voll), voll, 'flute');
    if (!r.ok) throw new Error();
    const score = ok(writeNoteAt(r.score, voll, at(0, 0), [p('E5')], Q));
    expect(addChordTone(score, voll, at(0, 0), p('G5'))).toEqual({ ok: false, error: 'chords-not-allowed' });
    expect(writeNoteAt(r.score, voll, at(0, 0), [p('E5'), p('G5')], Q)).toEqual({ ok: false, error: 'chords-not-allowed' });
  });

  it('moves or removes a single tone; the last tone gone leaves a rest', () => {
    const chord = ok(addChordTone(piano(), voll, at(0, 0), p('G4')));
    expect(m(ok(changeNotePitch(chord, voll, at(0, 0), p('C5'), 0)))[0]).toBe('n48@0 G4+C5');
    expect(changeNotePitch(chord, voll, at(0, 0), p('G4'), 0)).toEqual({ ok: false, error: 'duplicate-tone' });
    const one = ok(removeChordTone(chord, at(0, 0), 1));
    expect(m(one)[0]).toBe('n48@0 E4');
    expect(m(ok(removeChordTone(one, at(0, 0), 0)))).toEqual(['r192@0']);
  });

  it('an accidental for one tone', () => {
    const chord = ok(addChordTone(piano(), voll, at(0, 0), p('G4')));
    expect(m(ok(setAccidental(chord, voll, at(0, 0), 1, 1)))[0]).toBe('n48@0 E4+G#4');
  });

  it('a tie connects the tones both chords have; moving one moves it in both', () => {
    let score = ok(addChordTone(piano(), voll, at(0, 0), p('G4')));
    score = ok(writeNoteAt(score, voll, at(0, 48), [p('E4')], Q));
    score = ok(addChordTone(score, voll, at(0, 48), p('A4')));
    score = ok(setTie(score, voll, at(0, 0), true));
    expect(m(score).slice(0, 2)).toEqual(['n48@0 E4+G4~', 'n48@48 E4+A4']);
    const moved = ok(changeNotePitch(score, voll, at(0, 0), p('D4'), 0));
    expect(m(moved).slice(0, 2)).toEqual(['n48@0 D4+G4~', 'n48@48 D4+A4']);
  });

  it('the bass staff of the piano is a staff of its own', () => {
    const score = ok(writeNoteAt(createEmptyScore(voll), voll, at(0, 0, 1), [p('C3')], plain(96)));
    expect(m(score, 0, 1)).toEqual(['n96@0 C3', 'r96@96']);
    expect(m(score, 0, 0)).toEqual(['r192@0']);
  });
});
