import { describe as group, expect, it } from 'vitest';
import { modul1 } from '../modules/modul1';
import { describe, p } from '../test/helpers';
import { canPlace, changeDuration, changePitch, deleteEvent, setNote, setRest, type EditResult } from './edit';
import { firstFreeTick } from './measure';
import { createEmptyScore } from './score';
import type { Pitch, Score } from './types';

const at = (tick: number, measure = 0) => ({ staff: 0, measure, tick });
const withRests = { ...modul1, manualRests: true };

function ok(result: EditResult): Score {
  if (!result.ok) throw new Error(`Edit failed: ${result.error}`);
  return result.score;
}

/** Places several notes one after another: [tick, ticks, pitch]. */
function place(notes: Array<[number, number, string]>, measure = 0): Score {
  return notes.reduce(
    (score, [tick, ticks, pitch]) => ok(setNote(score, modul1, at(tick, measure), p(pitch), ticks)),
    createEmptyScore(modul1),
  );
}

const m = (score: Score, measure = 0) => describe(score.parts[0].staves[0].measures[measure]);

group('createEmptyScore', () => {
  it('creates 4 empty 4/4 measures in one treble staff, tempo 90', () => {
    const score = createEmptyScore(modul1);
    expect(score.format).toBe('fermate');
    expect(score.version).toBe(2);
    expect(score.pickup).toBe(0);
    expect(score.parts).toHaveLength(1);
    expect(score.parts[0]).toMatchObject({ instrument: 'piano', volume: 1, mute: false, solo: false });
    expect(score.moduleId).toBe('1');
    expect(score.timeSignature).toEqual({ beats: 4, beatValue: 4 });
    expect(score.keySignature).toBe(0);
    expect(score.tempo).toBe(90);
    expect(score.parts[0].staves).toHaveLength(1);
    expect(score.parts[0].staves[0].clef).toBe('treble');
    expect(score.parts[0].staves[0].measures.map((x) => describe(x))).toEqual([
      ['r192@0'],
      ['r192@0'],
      ['r192@0'],
      ['r192@0'],
    ]);
  });
});

group('setNote', () => {
  it('places a note and fills the rest with automatic rests', () => {
    expect(m(place([[0, 48, 'E4']]))).toEqual(['n48@0 E4', 'r48@48', 'r96@96']);
  });

  it('fills a measure with four quarters', () => {
    const score = place([
      [0, 48, 'C4'],
      [48, 48, 'D4'],
      [96, 48, 'E4'],
      [144, 48, 'F4'],
    ]);
    expect(m(score)).toEqual(['n48@0 C4', 'n48@48 D4', 'n48@96 E4', 'n48@144 F4']);
  });

  it('places notes in other measures', () => {
    const score = place([[0, 192, 'G4']], 3);
    expect(m(score, 3)).toEqual(['n192@0 G4']);
    expect(m(score, 0)).toEqual(['r192@0']);
  });

  it('overwrites: a shorter note leaves an automatic rest', () => {
    const score = place([
      [0, 96, 'C4'],
      [0, 48, 'G4'],
    ]);
    expect(m(score)).toEqual(['n48@0 G4', 'r48@48', 'r96@96']);
  });

  it('appends in the free space, however far right the tap was', () => {
    expect(m(place([[144, 48, 'E4']]))).toEqual(['n48@0 E4', 'r48@48', 'r96@96']);
    expect(m(place([[0, 48, 'C4'], [168, 24, 'D4']]))).toEqual(['n48@0 C4', 'n24@48 D4', 'r24@72', 'r96@96']);
  });

  it('replacing with a shorter note moves the following notes left', () => {
    const score = place([
      [0, 48, 'C4'],
      [48, 48, 'D4'],
      [96, 48, 'E4'],
      [48, 24, 'A4'],
    ]);
    expect(m(score)).toEqual(['n48@0 C4', 'n24@48 A4', 'n48@72 E4', 'r24@120', 'r48@144']);
  });

  it('replacing with a longer note moves the following notes right', () => {
    const score = place([
      [0, 48, 'C4'],
      [48, 48, 'D4'],
      [0, 96, 'A4'],
    ]);
    expect(m(score)).toEqual(['n96@0 A4', 'n48@96 D4', 'r48@144']);
  });

  it('rejects a note if the notes would no longer fit into the measure', () => {
    const full = place([[0, 96, 'C4'], [96, 96, 'D4']]);
    expect(setNote(full, modul1, at(0), p('C4'), 192)).toEqual({ ok: false, error: 'does-not-fit' });
    expect(setNote(full, modul1, at(192), p('C4'), 24)).toEqual({ ok: false, error: 'does-not-fit' });
    const three = place([[0, 48, 'C4'], [48, 48, 'D4'], [96, 48, 'E4']]);
    expect(setNote(three, modul1, at(144), p('C4'), 96)).toEqual({ ok: false, error: 'does-not-fit' });
  });

  it('rejects a tick inside a note', () => {
    expect(setNote(place([[0, 96, 'C4']]), modul1, at(48), p('D4'), 48)).toEqual({
      ok: false,
      error: 'invalid-position',
    });
  });

  it('rejects note values that Modul 1 does not have', () => {
    const score = createEmptyScore(modul1);
    for (const ticks of [72, 12, 16, 144]) {
      expect(setNote(score, modul1, at(0), p('C4'), ticks)).toEqual({
        ok: false,
        error: 'duration-not-allowed',
      });
    }
  });

  it("rejects pitches outside c'–f''", () => {
    const score = createEmptyScore(modul1);
    expect(setNote(score, modul1, at(0), p('B3'), 48)).toEqual({ ok: false, error: 'out-of-range' });
    expect(setNote(score, modul1, at(0), p('G5'), 48)).toEqual({ ok: false, error: 'out-of-range' });
    expect(setNote(score, modul1, at(0), p('C4'), 48).ok).toBe(true);
    expect(setNote(score, modul1, at(0), p('F5'), 48).ok).toBe(true);
  });

  it('rejects positions that do not exist', () => {
    const score = createEmptyScore(modul1);
    expect(setNote(score, modul1, at(0, 4), p('C4'), 48)).toEqual({ ok: false, error: 'invalid-position' });
    expect(setNote(score, modul1, { staff: 1, measure: 0, tick: 0 }, p('C4'), 48)).toEqual({
      ok: false,
      error: 'invalid-position',
    });
  });

  it('never changes the original score', () => {
    const score = createEmptyScore(modul1);
    const before = structuredClone(score);
    const pitch: Pitch = p('C4');
    const after = ok(setNote(score, modul1, at(0), pitch, 48));
    expect(score).toEqual(before);
    pitch.octave = 5; // changing the input afterwards must not change the score
    expect(m(after)[0]).toBe('n48@0 C4');
  });
});

group('canPlace', () => {
  it('tells which note values still fit at a spot', () => {
    const score = place([[0, 48, 'C4'], [48, 48, 'D4'], [96, 48, 'E4']]);
    const fits = (tick: number) => modul1.durations.filter((d) => canPlace(score, modul1, at(tick), d));
    expect(fits(144)).toEqual([48, 24]); // free space: one quarter left
    expect(fits(0)).toEqual([96, 48, 24]); // replacing the first quarter
    expect(fits(24)).toEqual([]); // inside a note
    expect(modul1.durations.filter((d) => canPlace(createEmptyScore(modul1), modul1, at(96), d))).toEqual([
      192, 96, 48, 24,
    ]);
  });
});

group('deleteEvent', () => {
  it('removes the note; the following notes move left', () => {
    const score = place([
      [0, 48, 'C4'],
      [48, 48, 'D4'],
    ]);
    const one = ok(deleteEvent(score, at(0)));
    expect(m(one)).toEqual(['n48@0 D4', 'r48@48', 'r96@96']);
    const both = ok(deleteEvent(one, at(0)));
    expect(m(both)).toEqual(['r192@0']);
  });

  it('fails if there is no note', () => {
    expect(deleteEvent(createEmptyScore(modul1), at(0))).toEqual({ ok: false, error: 'no-event' });
    expect(deleteEvent(place([[0, 96, 'C4']]), at(48))).toEqual({ ok: false, error: 'no-event' });
  });
});

group('changePitch', () => {
  it('changes only the pitch', () => {
    const score = ok(changePitch(place([[0, 48, 'C4'], [48, 96, 'C4']]), modul1, at(48), p('A4')));
    expect(m(score)).toEqual(['n48@0 C4', 'n96@48 A4', 'r48@144']);
  });

  it("stays within c'–f''", () => {
    expect(changePitch(place([[0, 48, 'C4']]), modul1, at(0), p('A5'))).toEqual({
      ok: false,
      error: 'out-of-range',
    });
  });

  it('fails if there is no note', () => {
    expect(changePitch(createEmptyScore(modul1), modul1, at(0), p('C4'))).toEqual({
      ok: false,
      error: 'no-note',
    });
  });
});

group('changeDuration', () => {
  it('makes a note shorter by splitting it; the following notes stay in place', () => {
    const score = ok(changeDuration(place([[0, 96, 'E4'], [96, 96, 'G4']]), modul1, at(0), 48));
    expect(m(score)).toEqual(['n48@0 E4', 'n48@48 E4', 'n96@96 G4']);
  });

  it('splits a quarter on beat 2 into two eighths on 2 and 2-and', () => {
    const before = place([[0, 48, 'C4'], [48, 48, 'G4'], [96, 48, 'E4']]);
    const score = ok(changeDuration(before, modul1, at(48), 24));
    expect(m(score)).toEqual(['n48@0 C4', 'n24@48 G4', 'n24@72 G4', 'n48@96 E4', 'r48@144']);
  });

  it('splits over several steps: a whole note into eight eighths, a half into two quarters', () => {
    const eighths = ok(changeDuration(place([[0, 192, 'A4']]), modul1, at(0), 24));
    expect(m(eighths)).toEqual([0, 24, 48, 72, 96, 120, 144, 168].map((t) => `n24@${t} A4`));
    const quarters = ok(changeDuration(place([[0, 96, 'D5']]), modul1, at(0), 48));
    expect(m(quarters)).toEqual(['n48@0 D5', 'n48@48 D5', 'r96@96']);
  });

  it('splitting works in a full measure', () => {
    const full = place([[0, 48, 'C4'], [48, 48, 'D4'], [96, 48, 'E4'], [144, 48, 'F4']]);
    const score = ok(changeDuration(full, modul1, at(144), 24));
    expect(m(score)).toEqual(['n48@0 C4', 'n48@48 D4', 'n48@96 E4', 'n24@144 F4', 'n24@168 F4']);
  });

  it('the split notes are independent copies', () => {
    const score = ok(changeDuration(place([[0, 48, 'E4']]), modul1, at(0), 24));
    const [a, b] = score.parts[0].staves[0].measures[0];
    expect(a.kind === 'note' && b.kind === 'note' && a.pitches !== b.pitches).toBe(true);
  });

  it('rejects note values that Modul 1 does not have', () => {
    expect(changeDuration(place([[0, 96, 'E4']]), modul1, at(0), 12)).toEqual({
      ok: false,
      error: 'duration-not-allowed',
    });
  });

  it('makes a note longer, the following notes move right', () => {
    const score = ok(changeDuration(place([[0, 48, 'E4'], [48, 48, 'F4']]), modul1, at(0), 96));
    expect(m(score)).toEqual(['n96@0 E4', 'n48@96 F4', 'r48@144']);
  });

  it('fails if the notes would no longer fit into the measure', () => {
    const score = place([[0, 48, 'C4'], [48, 48, 'D4'], [96, 48, 'E4'], [144, 48, 'F4']]);
    expect(changeDuration(score, modul1, at(144), 96)).toEqual({ ok: false, error: 'does-not-fit' });
    expect(changeDuration(score, modul1, at(0), 96)).toEqual({ ok: false, error: 'does-not-fit' });
  });

  it('fails if there is no note', () => {
    expect(changeDuration(createEmptyScore(modul1), modul1, at(0), 48)).toEqual({ ok: false, error: 'no-event' });
  });
});

group('firstFreeTick', () => {
  it('is where the cursor goes when tapping a measure', () => {
    expect(firstFreeTick(place([[0, 48, 'C4']]).parts[0].staves[0].measures[0])).toBe(48);
    expect(firstFreeTick(place([[0, 192, 'C4']]).parts[0].staves[0].measures[0])).toBeNull();
  });
});

group('setRest', () => {
  const rest = (score: Score, tick: number, ticks: number, measure = 0) =>
    ok(setRest(score, withRests, at(tick, measure), ticks));

  it('is only allowed when the link switches rests on', () => {
    expect(setRest(createEmptyScore(modul1), modul1, at(0), 48)).toEqual({ ok: false, error: 'rests-not-allowed' });
  });

  it('appends a set rest behind the last note, like a note', () => {
    const score = rest(place([[0, 48, 'C4']]), 48, 48);
    expect(m(score)).toEqual(['n48@0 C4', 'R48@48', 'r96@96']);
  });

  it('turns a note into a rest of the same value; the following notes stay', () => {
    const score = rest(place([[0, 48, 'C4'], [48, 48, 'D4']]), 0, 48);
    expect(m(score)).toEqual(['R48@0', 'n48@48 D4', 'r96@96']);
  });

  it('a note can replace a set rest (rest becomes note)', () => {
    const score = ok(setNote(rest(createEmptyScore(modul1), 0, 96), modul1, at(0), p('G4'), 96));
    expect(m(score)).toEqual(['n96@0 G4', 'r96@96']);
  });

  it('a set rest makes the measure full like a note', () => {
    const score = rest(place([[0, 48, 'C4'], [48, 48, 'D4'], [96, 48, 'E4']]), 144, 48);
    expect(firstFreeTick(score.parts[0].staves[0].measures[0])).toBeNull();
  });

  it('rejects rests that do not fit or values the module does not have', () => {
    const full = place([[0, 192, 'C4']]);
    expect(setRest(full, withRests, at(192), 48)).toEqual({ ok: false, error: 'does-not-fit' });
    expect(setRest(createEmptyScore(modul1), withRests, at(0), 12)).toEqual({ ok: false, error: 'duration-not-allowed' });
  });

  it('can be deleted; the following notes move left', () => {
    const score = rest(place([[0, 48, 'C4'], [48, 48, 'D4']]), 0, 48);
    expect(m(ok(deleteEvent(score, at(0))))).toEqual(['n48@0 D4', 'r48@48', 'r96@96']);
  });

  it('shorter: a half rest is split into two quarter rests', () => {
    const score = ok(changeDuration(rest(place([[0, 48, 'C4']]), 48, 96), modul1, at(48), 48));
    expect(m(score)).toEqual(['n48@0 C4', 'R48@48', 'R48@96', 'r48@144']);
  });

  it('longer: the following notes move right, or nothing changes if it does not fit', () => {
    const score = rest(createEmptyScore(modul1), 0, 48);
    const withNote = ok(setNote(score, modul1, at(48), p('D4'), 48));
    expect(m(ok(changeDuration(withNote, modul1, at(0), 96)))).toEqual(['R96@0', 'n48@96 D4', 'r48@144']);
    expect(changeDuration(withNote, modul1, at(0), 192)).toEqual({ ok: false, error: 'does-not-fit' });
  });

  it('changing the pitch of a rest is not possible', () => {
    expect(changePitch(rest(createEmptyScore(modul1), 0, 48), modul1, at(0), p('C4'))).toEqual({
      ok: false,
      error: 'no-note',
    });
  });
});
