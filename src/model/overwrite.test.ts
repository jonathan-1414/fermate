import { describe as group, expect, it } from 'vitest';
import { modul1 } from '../modules/modul1';
import { voll } from '../modules/voll';
import { describe, ok, p } from '../test/helpers';
import { plain } from './duration';
import { setPickup, setTimeSignature } from './measures';
import {
  changeNoteDuration,
  changeNotePitch,
  deleteNoteAt,
  fitsTimeSignature,
  isAllowedDuration,
  setAccidental,
  setTie,
  writeNoteAt,
} from './overwrite';
import { createEmptyScore } from './score';
import { nextPosition, positionAtTick } from './sequence';
import type { Duration, Score } from './types';


const W = plain(192);
const H = plain(96);
const Q = plain(48);
const E = plain(24);
const S = plain(12);
const dotted = (base: 96 | 48 | 24): Duration => ({ base, dotted: true, triplet: false });
const triplet = (base: 48 | 24): Duration => ({ base, dotted: false, triplet: true });
const at = (measure: number, tick: number) => ({ staff: 0, measure, tick });

function empty(meter = '4/4'): Score {
  const score = createEmptyScore(voll);
  return meter === '4/4' ? score : ok(setTimeSignature(score, voll, meter));
}
const note = (score: Score, measure: number, tick: number, pitch: string, d: Duration) =>
  ok(writeNoteAt(score, voll, at(measure, tick), [p(pitch)], d));
const m = (score: Score, measure = 0) => describe(score.parts[0].staves[0].measures[measure]);

group('writing notes: rests everywhere else', () => {
  it('a quarter on beat 1 leaves a quarter rest and a half rest', () => {
    expect(m(note(empty(), 0, 0, 'C4', Q))).toEqual(['n48@0 C4', 'r48@48', 'r96@96']);
  });

  it('an empty measure has one whole-measure rest in every time signature', () => {
    expect(m(empty())).toEqual(['r192@0']);
    expect(m(empty('3/4'))).toEqual(['r144@0']);
    expect(m(empty('2/4'))).toEqual(['r96@0']);
    expect(m(empty('6/8'))).toEqual(['r144@0']);
    expect(m(empty('2/2'))).toEqual(['r192@0']);
  });

  it('writes into any rest; the rests around it are rewritten by the beats', () => {
    const score = note(note(empty(), 0, 0, 'C4', Q), 0, 96, 'E4', Q);
    expect(m(score)).toEqual(['n48@0 C4', 'r48@48', 'n48@96 E4', 'r48@144']);
  });

  it('writes at the start of an event or anywhere in a rest, never inside a note', () => {
    expect(m(note(empty(), 0, 48, 'C4', Q))).toEqual(['r48@0', 'n48@48 C4', 'r96@96']);
    const half = note(empty(), 0, 0, 'C4', H);
    expect(writeNoteAt(half, voll, at(0, 48), [p('C4')], Q)).toEqual({ ok: false, error: 'invalid-position' });
    expect(writeNoteAt(empty(), voll, at(0, 50), [p('C4')], Q)).toEqual({ ok: false, error: 'invalid-position' });
  });

  it('rejects values the module does not have, and chords (for now)', () => {
    const fail = (error: string) => ({ ok: false, error });
    expect(writeNoteAt(empty(), modul1, at(0, 0), [p('C4')], dotted(48))).toEqual(fail('duration-not-allowed'));
    expect(writeNoteAt(empty(), voll, at(0, 0), [p('C4'), p('E4')], Q)).toEqual(fail('chords-not-allowed'));
  });
});

group('overwriting', () => {
  it('a longer note overwrites the notes it covers', () => {
    const score = note(note(note(empty(), 0, 0, 'C4', Q), 0, 48, 'D4', Q), 0, 0, 'G4', H);
    expect(m(score)).toEqual(['n96@0 G4', 'r96@96']);
  });

  it('a note that is only partly covered disappears; its rest of time becomes rest', () => {
    const score = note(note(note(empty(), 0, 0, 'C4', Q), 0, 48, 'D4', Q), 0, 0, 'G4', dotted(48));
    expect(m(score)).toEqual(['n72@0 G4', 'r24@72', 'r96@96']);
  });

  it('notes after the overwritten stretch keep their place', () => {
    const score = note(note(note(empty(), 0, 0, 'C4', Q), 0, 96, 'E4', Q), 0, 0, 'G4', E);
    expect(m(score)).toEqual(['n24@0 G4', 'r24@24', 'r48@48', 'n48@96 E4', 'r48@144']);
  });

  it('sixteenths and dotted values', () => {
    const score = note(note(empty(), 0, 0, 'C4', dotted(24)), 0, 36, 'D4', S);
    expect(m(score)).toEqual(['n36@0 C4', 'n12@36 D4', 'r48@48', 'r96@96']);
  });
});

group('changing the value of a note', () => {
  it('shorter: the rest of its time becomes rest', () => {
    const score = ok(changeNoteDuration(note(empty(), 0, 0, 'C4', H), voll, at(0, 0), Q));
    expect(m(score)).toEqual(['n48@0 C4', 'r48@48', 'r96@96']);
  });

  it('longer: it overwrites what follows', () => {
    const before = note(note(empty(), 0, 0, 'C4', Q), 0, 48, 'D4', Q);
    expect(m(ok(changeNoteDuration(before, voll, at(0, 0), H)))).toEqual(['n96@0 C4', 'r96@96']);
  });

  it('only notes have a value to change (a rest is only a place to write)', () => {
    expect(changeNoteDuration(empty(), voll, at(0, 0), Q)).toEqual({ ok: false, error: 'no-note' });
  });
});

group('over the bar line', () => {
  it('a note longer than the rest of the measure is tied into the next measure', () => {
    const score = note(empty(), 0, 144, 'G4', H);
    expect(m(score, 0)).toEqual(['r96@0', 'r48@96', 'n48@144 G4~']);
    expect(m(score, 1)).toEqual(['n48@0 G4', 'r48@48', 'r96@96']);
  });

  it('the parts are written by the beats', () => {
    const score = note(empty(), 0, 24, 'A4', W);
    expect(m(score, 0)).toEqual(['r24@0', 'n24@24 A4~', 'n48@48 A4~', 'n96@96 A4~']);
    expect(m(score, 1)).toEqual(['n24@0 A4', 'r24@24', 'r48@48', 'r96@96']);
  });

  it('overwrites at the start of the next measure', () => {
    const before = note(empty(), 1, 0, 'C5', H);
    const score = note(before, 0, 144, 'G4', H);
    expect(m(score, 1)).toEqual(['n48@0 G4', 'r48@48', 'r96@96']);
  });

  it('at the end of the piece nothing changes (no new measures)', () => {
    expect(writeNoteAt(empty(), voll, at(7, 144), [p('C4')], H)).toEqual({ ok: false, error: 'does-not-fit' });
  });

  it('without ties in the module, nothing goes over the bar line', () => {
    const noTies = { ...voll, ties: false };
    expect(writeNoteAt(empty(), noTies, at(0, 144), [p('C4')], H)).toEqual({ ok: false, error: 'does-not-fit' });
  });
});

group('deleting', () => {
  it('a deleted note becomes rest, nothing moves', () => {
    const before = note(note(empty(), 0, 0, 'C4', Q), 0, 48, 'D4', Q);
    expect(m(ok(deleteNoteAt(before, at(0, 0))))).toEqual(['r48@0', 'n48@48 D4', 'r96@96']);
  });

  it('the last note gone: a whole-measure rest again', () => {
    expect(m(ok(deleteNoteAt(note(empty(), 0, 48, 'C4', Q), at(0, 48))))).toEqual(['r192@0']);
  });

  it('a rest cannot be deleted', () => {
    expect(deleteNoteAt(empty(), at(0, 0))).toEqual({ ok: false, error: 'no-note' });
  });
});

group('triplets', () => {
  it('a triplet note starts a group, the other places are triplet rests', () => {
    const score = note(empty(), 0, 0, 'C4', triplet(24));
    expect(m(score)).toEqual(['n16@0 C4', 'r16@16', 'r16@32', 'r48@48', 'r96@96']);
    expect(m(note(score, 0, 16, 'D4', triplet(24)))).toEqual(['n16@0 C4', 'n16@16 D4', 'r16@32', 'r48@48', 'r96@96']);
  });

  it('quarter triplets: three in a half', () => {
    expect(m(note(empty(), 0, 96, 'C4', triplet(48)))).toEqual(['r96@0', 'n32@96 C4', 'r32@128', 'r32@160']);
  });

  it('a group starts on a beat and must fit into the measure', () => {
    const score = note(empty(), 0, 0, 'C4', E);
    expect(writeNoteAt(score, voll, at(0, 24), [p('C4')], triplet(24))).toEqual({ ok: false, error: 'triplet-position' });
    const threeFour = note(empty('3/4'), 0, 0, 'C4', H);
    expect(writeNoteAt(threeFour, voll, at(0, 96), [p('C4')], triplet(48))).toEqual({ ok: false, error: 'does-not-fit' });
  });

  it('a group holds only one kind of triplet; plain values not in its middle', () => {
    const score = note(empty(), 0, 0, 'C4', triplet(24));
    expect(writeNoteAt(score, voll, at(0, 16), [p('C4')], triplet(48))).toEqual({ ok: false, error: 'triplet-mismatch' });
    expect(writeNoteAt(score, voll, at(0, 16), [p('C4')], E)).toEqual({ ok: false, error: 'inside-triplet' });
  });

  it('a plain note at the start of a group overwrites the whole group', () => {
    const score = note(note(empty(), 0, 0, 'C4', triplet(24)), 0, 32, 'E4', triplet(24));
    expect(m(note(score, 0, 0, 'G4', E))).toEqual(['n24@0 G4', 'r24@24', 'r48@48', 'r96@96']);
  });

  it('a group without notes disappears', () => {
    const score = note(empty(), 0, 48, 'C4', triplet(24));
    expect(m(ok(deleteNoteAt(score, at(0, 48))))).toEqual(['r192@0']);
  });

  it('there are no triplets in 6/8', () => {
    expect(writeNoteAt(empty('6/8'), voll, at(0, 0), [p('C4')], triplet(24))).toEqual({
      ok: false,
      error: 'duration-not-allowed',
    });
  });
});

group('ties', () => {
  const twoGs = () => note(note(empty(), 0, 96, 'G4', H), 1, 0, 'G4', Q);

  it('a tie needs a next note with the same pitch', () => {
    const tied = ok(setTie(twoGs(), voll, at(0, 96), true));
    expect(m(tied, 0)).toEqual(['r96@0', 'n96@96 G4~']);
    const other = note(note(empty(), 0, 96, 'G4', H), 1, 0, 'A4', Q);
    expect(setTie(other, voll, at(0, 96), true)).toEqual({ ok: false, error: 'no-matching-note' });
    expect(m(ok(setTie(tied, voll, at(0, 96), false)), 0)).toEqual(['r96@0', 'n96@96 G4']);
  });

  it('changing the pitch moves the tied notes along', () => {
    const tied = ok(setTie(twoGs(), voll, at(0, 96), true));
    const moved = ok(changeNotePitch(tied, voll, at(1, 0), p('B4')));
    expect([m(moved, 0)[1], m(moved, 1)[0]]).toEqual(['n96@96 B4~', 'n48@0 B4']);
  });

  it('the tie disappears when the next note goes or gets another pitch', () => {
    const tied = ok(setTie(twoGs(), voll, at(0, 96), true));
    expect(m(ok(deleteNoteAt(tied, at(1, 0))), 0)).toEqual(['r96@0', 'n96@96 G4']);
    expect(m(note(tied, 1, 0, 'C5', Q), 0)).toEqual(['r96@0', 'n96@96 G4']);
  });
});

group('accidentals', () => {
  it('sets sharp, flat or natural; tied notes follow', () => {
    const score = ok(setTie(note(note(empty(), 0, 144, 'F4', Q), 1, 0, 'F4', Q), voll, at(0, 144), true));
    const sharp = ok(setAccidental(score, voll, at(0, 144), 1));
    expect([m(sharp, 0)[2], m(sharp, 1)[0]]).toEqual(['n48@144 F#4~', 'n48@0 F#4']);
    expect(m(ok(setAccidental(sharp, voll, at(1, 0), 0)), 1)[0]).toBe('n48@0 F4');
  });

  it('not in a module without accidentals', () => {
    expect(setAccidental(note(empty(), 0, 0, 'F4', Q), modul1, at(0, 0), 1)).toEqual({ ok: false, error: 'not-allowed' });
  });
});

group('cursor positions', () => {
  it('after a note: the next event, behind tied notes', () => {
    const score = note(empty(), 0, 144, 'G4', H);
    expect(nextPosition(score, at(0, 144))).toEqual(at(1, 48));
    expect(nextPosition(score, at(0, 0))).toEqual(at(0, 96));
  });

  it('a tap anywhere in an event means its start', () => {
    const score = note(empty(), 0, 0, 'C4', Q);
    expect(positionAtTick(score, 0, 0, 30)).toEqual(at(0, 0));
    expect(positionAtTick(score, 0, 0, 120)).toEqual(at(0, 96));
  });

  it('stays at the end of the piece', () => {
    expect(nextPosition(empty(), at(7, 0))).toEqual(at(7, 0));
  });
});

group('which values the toolbar offers', () => {
  it('no triplets in 6/8, no dots in Modul 1', () => {
    expect(isAllowedDuration(voll, { beats: 6, beatValue: 8 }, triplet(24))).toBe(false);
    expect(isAllowedDuration(voll, { beats: 4, beatValue: 4 }, triplet(24))).toBe(true);
    expect(isAllowedDuration(modul1, { beats: 4, beatValue: 4 }, dotted(48))).toBe(false);
  });

  it('values that never fit into a measure are hidden', () => {
    expect(fitsTimeSignature({ beats: 3, beatValue: 4 }, W)).toBe(false);
    expect(fitsTimeSignature({ beats: 3, beatValue: 4 }, dotted(96))).toBe(true);
    expect(fitsTimeSignature({ beats: 2, beatValue: 4 }, dotted(96))).toBe(false);
  });
});

group('pickup and the last measure', () => {
  it('notes write into the shortened measures like into any other', () => {
    const score = ok(setPickup(empty(), voll, 48));
    expect(m(note(score, 0, 0, 'G4', Q), 0)).toEqual(['n48@0 G4']);
    expect(m(score, 8)).toEqual(['r96@0', 'r48@96']);
  });
});
