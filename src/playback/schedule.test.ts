import { describe, expect, it } from 'vitest';
import { setNote, setRest } from '../model/edit';
import { plain } from '../model/duration';
import { addPart } from '../model/instruments';
import { setTie, writeNoteAt } from '../model/overwrite';
import { voll } from '../modules/voll';
import { createEmptyScore } from '../model/score';
import type { Score } from '../model/types';
import { modul1 } from '../modules/modul1';
import { ok, p } from '../test/helpers';
import { buildSchedule, noteName, playbackStart } from './schedule';

function place(notes: Array<[number, number, number, string]>): Score {
  return notes.reduce((score, [measure, tick, ticks, pitch]) => {
    const result = setNote(score, modul1, { staff: 0, measure, tick }, p(pitch), ticks);
    if (!result.ok) throw new Error(result.error);
    return result.score;
  }, createEmptyScore(modul1));
}

// Tempo 90: one quarter = 60/90 s = 2/3 s; one 4/4 measure = 8/3 s.
const Q = 60 / 90;

describe('buildSchedule', () => {
  it('is empty for an empty score', () => {
    expect(buildSchedule(createEmptyScore(modul1))).toEqual({ notes: [], end: 0 });
  });

  it('times notes by tempo', () => {
    const schedule = buildSchedule(place([[0, 0, 48, 'C4'], [0, 48, 96, 'E4']]));
    expect(schedule.notes.map((n) => [n.note, n.time, n.duration])).toEqual([
      ['C4', 0, Q],
      ['E4', Q, 2 * Q],
    ]);
    expect(schedule.end).toBeCloseTo(3 * Q);
  });

  it('keeps the free space of a measure as silence and stops after the last note', () => {
    const schedule = buildSchedule(place([[0, 0, 48, 'C4'], [2, 0, 24, 'G4']]));
    expect(schedule.notes).toHaveLength(2);
    expect(schedule.notes[1].time).toBeCloseTo(8 * Q);
    expect(schedule.notes[1].at).toEqual({ staff: 0, measure: 2, tick: 0 });
    expect(schedule.end).toBeCloseTo(8.5 * Q);
  });
});

describe('noteName', () => {
  it('writes pitches the way Tone.js expects', () => {
    expect(noteName(p('C4'))).toBe('C4');
    expect(noteName(p('F#5'))).toBe('F#5');
    expect(noteName(p('Bb4'))).toBe('Bb4');
  });

  it('includes set rests silently (for the marking) and plays up to their end', () => {
    const withRests = { ...modul1, manualRests: true };
    const result = setRest(place([[0, 0, 48, 'C4']]), withRests, { staff: 0, measure: 0, tick: 48 }, 96);
    if (!result.ok) throw new Error(result.error);
    const schedule = buildSchedule(result.score);
    expect(schedule.notes.map((n) => [n.note, n.time, n.duration])).toEqual([
      ['C4', 0, Q],
      [null, Q, 2 * Q],
    ]);
    expect(schedule.end).toBeCloseTo(3 * Q);
  });

  it('has nothing to play with only set rests', () => {
    const result = setRest(createEmptyScore(modul1), { ...modul1, manualRests: true }, { staff: 0, measure: 0, tick: 0 }, 48);
    if (!result.ok) throw new Error(result.error);
    expect(buildSchedule(result.score)).toEqual({ notes: [], end: 0 });
  });
});

describe('buildSchedule in the full version', () => {
  const at = (staff: number, measure: number, tick: number) => ({ staff, measure, tick });
  const H = 60 / 90 * 2; // half note at tempo 90

  it('tied notes sound as one note; the tied note still gets its marking', () => {
    let score = ok(writeNoteAt(createEmptyScore(voll), voll, at(0, 0, 96), [p('G4')], plain(192))); // half + half tied over the bar line
    const schedule = buildSchedule(score);
    expect(schedule.notes.map((n) => [n.note, n.time, n.duration])).toEqual([
      ['G4', H, 2 * H],
      [null, 2 * H, H],
    ]);
    score = ok(setTie(score, voll, at(0, 0, 96), false));
    expect(buildSchedule(score).notes.map((n) => n.note)).toEqual(['G4', 'G4']);
  });

  it('a chord is one entry per pitch; every staff and part plays along', () => {
    let score = ok(writeNoteAt(createEmptyScore(voll), voll, at(0, 0, 0), [p('C4'), p('E4')], plain(96)));
    score = ok(writeNoteAt(score, voll, at(1, 0, 0), [p('C3')], plain(96)));
    const added = addPart(score, voll, 'flute');
    if (!added.ok) throw new Error();
    score = ok(writeNoteAt(added.score, voll, at(0, 0, 0), [p('G5')], plain(96)));
    const notes = buildSchedule(score).notes;
    expect(notes.map((n) => [n.note, n.part, n.at.staff]).sort()).toEqual([
      ['C3', 1, 2],
      ['C4', 1, 1],
      ['E4', 1, 1],
      ['G5', 0, 0],
    ]);
  });
});

describe('swing', () => {
  const E = plain(24);
  const write = (score: Score, tick: number, pitch: string, d = E) =>
    ok(writeNoteAt(score, voll, { staff: 0, measure: 0, tick }, [p(pitch)], d));
  const eighths = () => write(write(write(createEmptyScore(voll), 0, 'C4'), 24, 'D4'), 48, 'E4', plain(48));
  const times = (score: Score) => buildSchedule(score).notes.map((n) => [n.note, +(n.time / Q).toFixed(3), +(n.duration / Q).toFixed(3)]);

  it('two eighths on a quarter sound long–short (2:1), other values stay', () => {
    expect(times({ ...eighths(), swing: true })).toEqual([
      ['C4', 0, 0.667],
      ['D4', 0.667, 0.333],
      ['E4', 1, 1],
    ]);
  });

  it('without the switch everything stays straight', () => {
    expect(times(eighths())).toEqual([
      ['C4', 0, 0.5],
      ['D4', 0.5, 0.5],
      ['E4', 1, 1],
    ]);
  });

  it('an eighth after an eighth rest comes late (off-beat)', () => {
    expect(times({ ...write(createEmptyScore(voll), 24, 'D4'), swing: true })).toEqual([['D4', 0.667, 0.333]]);
  });

  it('sixteenths, dotted rhythms and triplets do not swing', () => {
    const dotted = write(write(createEmptyScore(voll), 0, 'C4', { base: 24, dotted: true, triplet: false }), 36, 'D4', plain(12));
    expect(times({ ...dotted, swing: true })).toEqual([
      ['C4', 0, 0.75],
      ['D4', 0.75, 0.25],
    ]);
  });

  it('no swing in 6/8', () => {
    const score = { ...eighths(), swing: true, timeSignature: { beats: 6, beatValue: 8 } };
    expect(times(score)[1]).toEqual(['D4', 0.5, 0.5]);
  });
});

describe('playing from the cursor or a marking', () => {
  const write = (score: Score, measure: number, tick: number, pitch: string, staff = 0) =>
    ok(writeNoteAt(score, voll, { staff, measure, tick }, [p(pitch)], plain(48)));
  const piece = () => write(write(write(createEmptyScore(voll), 0, 0, 'C4'), 0, 48, 'D4'), 1, 0, 'E4');

  it('starts at the cursor, the first note there at time 0', () => {
    const schedule = buildSchedule(piece(), { from: 48, to: Infinity });
    expect(schedule.notes.map((n) => [n.note, +(n.time / Q).toFixed(3)])).toEqual([
      ['D4', 0],
      ['E4', 3],
    ]);
  });

  it('a marking plays only its stretch and its staves', () => {
    const two = write(piece(), 0, 0, 'C3', 1); // the piano's bass staff
    const marked = buildSchedule(two, { from: 0, to: 96, firstStaff: 0, lastStaff: 0 });
    expect(marked.notes.map((n) => n.note)).toEqual(['C4', 'D4']);
  });

  it('after the last note it starts at the beginning', () => {
    expect(playbackStart(piece(), 48)).toBe(48);
    expect(playbackStart(piece(), 192)).toBe(192);
    expect(playbackStart(piece(), 240)).toBe(0);
  });

  it('a note tied into the section sounds from the section start', () => {
    const tied = ok(writeNoteAt(createEmptyScore(voll), voll, { staff: 0, measure: 0, tick: 144 }, [p('G4')], plain(96)));
    const schedule = buildSchedule(tied, { from: 192, to: Infinity });
    expect(schedule.notes.map((n) => [n.note, n.time, +(n.duration / Q).toFixed(3)])).toEqual([['G4', 0, 1]]);
  });
});
