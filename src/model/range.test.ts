import { describe as group, expect, it } from 'vitest';
import { voll } from '../modules/voll';
import { describe, ok, p } from '../test/helpers';
import { plain } from './duration';
import { addPart } from './instruments';
import { setPickup } from './measures';
import { writeNoteAt } from './overwrite';
import { copyRange, deleteRange, fromAbsolute, measureRange, pasteClip, rangeBetween, toAbsolute } from './range';
import { createEmptyScore } from './score';
import { createConfiguredScore } from './setup';
import type { Duration, Score } from './types';

const Q = plain(48);
const H = plain(96);
const E = plain(24);
const triplet: Duration = { base: 24, dotted: false, triplet: true };
const at = (measure: number, tick: number, staff = 0) => ({ staff, measure, tick });
const note = (score: Score, measure: number, tick: number, pitch: string, d = Q, staff = 0) =>
  ok(writeNoteAt(score, voll, at(measure, tick, staff), [p(pitch)], d));
const m = (score: Score, measure = 0, staff = 0) => describe(score.parts.flatMap((part) => part.staves)[staff].measures[measure]);

function flute(): Score {
  return ok(createConfiguredScore(voll, { instruments: ['flute'], timeSignature: '4/4', keySignature: 0, pickup: 0, tempo: 90 }));
}
/** C D E F as quarters in measure 1. */
function scale(): Score {
  return ['C4', 'D4', 'E4', 'F4'].reduce((s, pitch, i) => note(s, 0, i * 48, pitch), flute());
}

group('positions in the piece', () => {
  it('absolute ticks and back, also with a pickup', () => {
    const score = ok(setPickup(flute(), voll, 48));
    expect(toAbsolute(score, 1, 96)).toBe(48 + 96);
    expect(fromAbsolute(score, 48 + 96)).toEqual({ measure: 1, tick: 96 });
    expect(fromAbsolute(score, 0)).toEqual({ measure: 0, tick: 0 });
  });
});

group('marking', () => {
  it('from one note to another, both included, in either order', () => {
    expect(rangeBetween(scale(), at(0, 48), at(0, 96))).toEqual({ firstStaff: 0, lastStaff: 0, from: 48, to: 144 });
    expect(rangeBetween(scale(), at(0, 96), at(0, 48))).toEqual({ firstStaff: 0, lastStaff: 0, from: 48, to: 144 });
  });

  it('a rectangle over several staves', () => {
    const score = ok(addPart(scale(), voll, 'violin'));
    // From the (empty) violin's whole-measure rest to the flute's D: the rest reaches the bar line.
    expect(rangeBetween(score, at(0, 0, 1), at(0, 48, 0))).toEqual({ firstStaff: 0, lastStaff: 1, from: 0, to: 192 });
    expect(rangeBetween(score, at(0, 0, 0), at(0, 48, 0))).toEqual({ firstStaff: 0, lastStaff: 0, from: 0, to: 96 });
  });

  it('a cut triplet group is marked completely', () => {
    const score = note(note(flute(), 0, 48, 'C4', triplet), 0, 64, 'D4', triplet);
    expect(rangeBetween(score, at(0, 0), at(0, 64))).toMatchObject({ from: 0, to: 96 });
  });

  it('whole measures over the measure numbers, all staves', () => {
    const score = ok(addPart(scale(), voll, 'violin'));
    expect(measureRange(score, 2, 1)).toEqual({ firstStaff: 0, lastStaff: 1, from: 192, to: 576 });
  });
});

group('deleting a marking', () => {
  it('the marked notes become rests, nothing moves', () => {
    const score = ok(deleteRange(scale(), rangeBetween(scale(), at(0, 48), at(0, 96))));
    expect(m(score)).toEqual(['n48@0 C4', 'r48@48', 'r48@96', 'n48@144 F4']);
  });

  it('nothing to delete in a marking without notes', () => {
    expect(deleteRange(flute(), measureRange(flute(), 0, 0))).toEqual({ ok: false, error: 'no-note' });
  });
});

group('copy and paste', () => {
  it('copies the notes and pastes them at the cursor, overwriting', () => {
    const score = note(scale(), 1, 0, 'G4', H);
    const clip = copyRange(score, rangeBetween(score, at(0, 0), at(0, 48)))!;
    const pasted = ok(pasteClip(score, voll, at(1, 48), clip));
    // The half note on beat 1 is partly covered: it becomes rest.
    expect(m(pasted, 1)).toEqual(['r48@0', 'n48@48 C4', 'n48@96 D4', 'r48@144']);
  });

  it('nothing is copied from a marking without notes', () => {
    expect(copyRange(flute(), measureRange(flute(), 3, 3))).toBeNull();
  });

  it('a pasted note across the bar line is tied', () => {
    const clip = copyRange(scale(), rangeBetween(scale(), at(0, 0), at(0, 0)))!;
    const half = copyRange(note(flute(), 0, 0, 'A4', H), measureRange(flute(), 0, 0))!;
    const pasted = ok(pasteClip(scale(), voll, at(0, 144), half));
    expect(m(pasted)).toEqual(['n48@0 C4', 'n48@48 D4', 'n48@96 E4', 'n48@144 A4~']);
    expect(m(pasted, 1)[0]).toBe('n48@0 A4');
    expect(clip.length).toBe(48);
  });

  it('adds empty measures at the end when needed, at most 32', () => {
    const score = scale();
    const clip = copyRange(score, measureRange(score, 0, 0))!;
    const pasted = ok(pasteClip(score, voll, at(7, 96), clip));
    expect(pasted.parts[0].staves[0].measures).toHaveLength(9);
    expect(m(pasted, 8)).toEqual(['n48@0 E4', 'n48@48 F4', 'r96@96']);
    const long = copyRange(score, measureRange(score, 0, 7))!;
    let big = score;
    for (let i = 0; i < 3; i++) big = ok(pasteClip(big, voll, at(big.parts[0].staves[0].measures.length - 1, 0), long));
    expect(pasteClip(big, voll, at(big.parts[0].staves[0].measures.length - 1, 0), long)).toEqual({ ok: false, error: 'too-many-measures' });
  });

  it('several staves go from the cursor downwards; too few staves: nothing happens', () => {
    const two = ok(addPart(scale(), voll, 'violin'));
    const withViolin = note(two, 0, 0, 'G4', Q, 1);
    const clip = copyRange(withViolin, rangeBetween(withViolin, at(0, 0, 0), at(0, 0, 1)))!;
    const pasted = ok(pasteClip(withViolin, voll, at(2, 0, 0), clip));
    expect(m(pasted, 2, 0)[0]).toBe('n48@0 C4');
    expect(m(pasted, 2, 1)[0]).toBe('n48@0 G4');
    expect(pasteClip(withViolin, voll, at(2, 0, 1), clip)).toEqual({ ok: false, error: 'not-enough-staves' });
  });

  it('chords keep only the highest tone where chords are not allowed', () => {
    const piano = ok(writeNoteAt(createEmptyScore(voll), voll, at(0, 0), [p('C4'), p('E4'), p('G4')], Q));
    const withFlute = ok(addPart(piano, voll, 'flute')); // flute, piano
    const clip = copyRange(withFlute, rangeBetween(withFlute, at(0, 0, 1), at(0, 0, 1)))!;
    expect(m(ok(pasteClip(withFlute, voll, at(1, 0, 0), clip)), 1, 0)[0]).toBe('n48@0 G4');
  });

  it('a tone outside the input range stops the paste', () => {
    const low = note(createEmptyScore(voll), 0, 0, 'C2', Q, 1); // piano, bass staff
    const withFlute = ok(addPart(low, voll, 'flute'));
    const clip = copyRange(withFlute, rangeBetween(withFlute, at(0, 0, 2), at(0, 0, 2)))!;
    expect(pasteClip(withFlute, voll, at(1, 0, 0), clip)).toEqual({ ok: false, error: 'out-of-range' });
  });

  it('triplet groups are pasted whole, only on a beat; never into the middle of a group', () => {
    const score = note(note(flute(), 0, 0, 'C4', triplet), 0, 32, 'E4', triplet);
    const clip = copyRange(score, rangeBetween(score, at(0, 0), at(0, 0)))!;
    expect(m(ok(pasteClip(score, voll, at(1, 48), clip)), 1)).toEqual(['r48@0', 'n16@48 C4', 'r16@64', 'n16@80 E4', 'r96@96']);
    expect(pasteClip(score, voll, at(0, 16), clip)).toEqual({ ok: false, error: 'inside-triplet' });
    const eighths = note(flute(), 0, 0, 'C4', E);
    expect(pasteClip(eighths, voll, at(0, 24), clip)).toEqual({ ok: false, error: 'triplet-position' });
  });
});
