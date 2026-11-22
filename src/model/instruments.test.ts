import { describe, expect, it } from 'vitest';
import { modul1 } from '../modules/modul1';
import { voll } from '../modules/voll';
import { describe as show, ok, p } from '../test/helpers';
import { plain } from './duration';
import { addPart, completeStaves, entryRange, isOutsideRange, movePart, partNames, removePart } from './instruments';
import { setPickup } from './measures';
import { writeNoteAt } from './overwrite';
import { pitchToMidi } from './pitch';
import { createEmptyScore } from './score';
import type { Score } from './types';

const add = (score: Score, id: string) => {
  const result = addPart(score, voll, id);
  if (!result.ok) throw new Error(result.error);
  return result.score;
};
const instruments = (score: Score) => score.parts.map((part) => part.instrument);

describe('instruments', () => {
  it('a new score of the full version is a piano with two staves; Modul 1 has one', () => {
    expect(createEmptyScore(voll).parts[0].staves.map((s) => s.clef)).toEqual(['treble', 'bass']);
    expect(createEmptyScore(modul1).parts[0].staves.map((s) => s.clef)).toEqual(['treble']);
  });

  it('new instruments go to their place in the score order', () => {
    let score = add(createEmptyScore(voll), 'violin');
    score = add(score, 'flute');
    score = add(score, 'cello');
    score = add(score, 'trumpet');
    expect(instruments(score)).toEqual(['flute', 'trumpet', 'piano', 'violin', 'cello']);
  });

  it('at most 10 instruments, the piano only once', () => {
    let score = createEmptyScore(voll);
    expect(addPart(score, voll, 'piano')).toEqual({ ok: false, error: 'piano-only-once' });
    for (const id of ['flute', 'clarinet', 'saxophone', 'trumpet', 'violin', 'violin', 'viola', 'cello', 'contrabass']) score = add(score, id);
    expect(score.parts).toHaveLength(10);
    expect(addPart(score, voll, 'flute')).toEqual({ ok: false, error: 'too-many-instruments' });
    expect(addPart(createEmptyScore(voll), voll, 'oboe')).toEqual({ ok: false, error: 'unknown-instrument' });
  });

  it('numbers instruments that are there more than once', () => {
    const score = add(add(add(createEmptyScore(voll), 'violin'), 'violin'), 'flute');
    expect(partNames(score)).toEqual(['Flöte', 'Klavier', 'Violine 1', 'Violine 2']);
    expect(partNames(score, true)).toEqual(['Fl.', 'Klav.', 'Vl. 1', 'Vl. 2']);
  });

  it('a new instrument gets as many empty measures as the others, also with a pickup', () => {
    const score = add(ok(setPickup(createEmptyScore(voll), voll, 48)), 'cello');
    const cello = score.parts[1].staves[0];
    expect(cello.clef).toBe('bass');
    expect(cello.measures).toHaveLength(9);
    expect(show(cello.measures[0])).toEqual(['r48@0']);
  });

  it('moves an instrument up or down, the piano with both staves', () => {
    const score = add(add(createEmptyScore(voll), 'violin'), 'flute'); // flute, piano, violin
    const down = ok(movePart(score, 1, 1));
    expect(instruments(down)).toEqual(['flute', 'violin', 'piano']);
    expect(down.parts[2].staves.map((s) => s.clef)).toEqual(['treble', 'bass']);
    expect(instruments(ok(movePart(score, 1, -1)))).toEqual(['piano', 'flute', 'violin']);
    expect(movePart(score, 0, -1)).toEqual({ ok: false, error: 'cannot-move' });
    expect(movePart(score, 2, 1)).toEqual({ ok: false, error: 'cannot-move' });
  });

  it('numbers by place: the upper violin is always "Violine 1"', () => {
    const score = add(add(createEmptyScore(voll), 'violin'), 'violin'); // piano, violin, violin
    const marked = { ...score, parts: score.parts.map((part, i) => ({ ...part, volume: i / 10 })) };
    const moved = ok(movePart(marked, 2, -1));
    expect(partNames(moved)).toEqual(['Klavier', 'Violine 1', 'Violine 2']);
    expect(moved.parts[1].volume).toBe(0.2); // the lower one went up and is now "Violine 1"
  });

  it('a new instrument goes before the first one that comes later in the score order, also after moving', () => {
    const score = ok(movePart(add(createEmptyScore(voll), 'violin'), 1, -1)); // violin, piano
    expect(instruments(add(score, 'flute'))).toEqual(['flute', 'violin', 'piano']);
    expect(instruments(add(score, 'cello'))).toEqual(['violin', 'piano', 'cello']);
  });

  it('removes an instrument, but not the last one', () => {
    const score = add(createEmptyScore(voll), 'violin');
    expect(instruments(ok(removePart(score, 0)))).toEqual(['violin']);
    expect(removePart(createEmptyScore(voll), 0)).toEqual({ ok: false, error: 'last-instrument' });
  });
});

describe('range', () => {
  it('notes can be entered an octave beyond the range; those are marked', () => {
    const score = add(createEmptyScore(voll), 'flute');
    const flute = score.parts[0];
    // Flute for pupils: c' to g'''.
    expect(entryRange(voll, flute)).toEqual({ low: pitchToMidi(p('C3')), high: pitchToMidi(p('G7')) });
    expect([isOutsideRange(flute, p('B3')), isOutsideRange(flute, p('C4')), isOutsideRange(flute, p('G6')), isOutsideRange(flute, p('A6'))]).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(writeNoteAt(score, voll, { staff: 0, measure: 0, tick: 0 }, [p('B2')], plain(48))).toEqual({ ok: false, error: 'out-of-range' });
    expect(writeNoteAt(score, voll, { staff: 0, measure: 0, tick: 0 }, [p('B3')], plain(48)).ok).toBe(true);
  });

  it('Modul 1 keeps its own range', () => {
    expect(entryRange(modul1, createEmptyScore(modul1).parts[0])).toEqual({ low: pitchToMidi(p('C4')), high: pitchToMidi(p('F5')) });
  });
});

describe('opening an older score', () => {
  it('a piano saved with one staff gets its bass staff back; the notes stay', () => {
    const old = ok(writeNoteAt(createEmptyScore(voll), voll, { staff: 0, measure: 0, tick: 0 }, [p('E4')], plain(48)));
    old.parts[0].staves.pop();
    const score = completeStaves(old, voll);
    expect(score.parts[0].staves.map((s) => s.clef)).toEqual(['treble', 'bass']);
    expect(show(score.parts[0].staves[0].measures[0])[0]).toBe('n48@0 E4');
    expect(score.parts[0].staves[1].measures).toHaveLength(8);
  });

  it('Modul 1 keeps its one staff', () => {
    const score = createEmptyScore(modul1);
    expect(completeStaves(score, modul1)).toBe(score);
  });
});
