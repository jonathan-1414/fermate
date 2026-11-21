import { describe, expect, it } from 'vitest';
import { modul1 } from '../modules/modul1';
import { voll } from '../modules/voll';
import { ok, p } from '../test/helpers';
import { setPickup } from './measures';
import { plain } from './duration';
import { setNote } from './edit';
import { createEmptyScore } from './score';
import { parseScore } from './validate';

function sample() {
  const result = setNote(createEmptyScore(modul1), modul1, { staff: 0, measure: 0, tick: 0 }, p('E4'), 48);
  if (!result.ok) throw new Error();
  const score = result.score;
  score.meta = { title: 'Mein Lied', names: ['Mia', 'Ben'], className: '7a' };
  return score;
}

describe('parseScore', () => {
  it('accepts a valid score (also after JSON round trip)', () => {
    const score = sample();
    expect(parseScore(JSON.parse(JSON.stringify(score)), modul1)).toEqual(score);
  });

  it('rejects anything that is not a score', () => {
    for (const data of [null, 42, 'text', [], {}]) expect(parseScore(data, modul1)).toBeNull();
  });

  it('rejects a score of another module or version', () => {
    expect(parseScore({ ...sample(), moduleId: '2' }, modul1)).toBeNull();
    expect(parseScore({ ...sample(), version: 1 }, modul1)).toBeNull();

  });

  it('rejects broken measures', () => {
    const tooShort = sample();
    tooShort.parts[0].staves[0].measures[1] = [{ kind: 'rest', duration: plain(96), auto: true }];
    expect(parseScore(tooShort, modul1)).toBeNull();

    const outOfRange = sample();
    outOfRange.parts[0].staves[0].measures[0][0] = { kind: 'note', pitches: [p('C6')], duration: plain(48) };
    expect(parseScore(outOfRange, modul1)).toBeNull();

    const missingMeasure = sample();
    missingMeasure.parts[0].staves[0].measures.pop();
    expect(parseScore(missingMeasure, modul1)).toBeNull();
  });

  it('keeps set rests, also when the link does not allow setting new ones', () => {
    const score = sample();
    score.parts[0].staves[0].measures[1] = [
      { kind: 'rest', duration: plain(48), auto: false },
      { kind: 'rest', duration: plain(48), auto: true },
      { kind: 'rest', duration: plain(96), auto: true },
    ];
    expect(parseScore(JSON.parse(JSON.stringify(score)), modul1)).toEqual(score);
  });

  it('rejects set rests with a value the module does not have', () => {
    const score = sample();
    score.parts[0].staves[0].measures[1] = [
      { kind: 'rest', duration: plain(12), auto: false },
      { kind: 'rest', duration: plain(12), auto: true },
      { kind: 'rest', duration: plain(24), auto: true },
      { kind: 'rest', duration: plain(48), auto: true },
      { kind: 'rest', duration: plain(96), auto: true },
    ];
    expect(parseScore(score, modul1)).toBeNull();
  });

  it('rejects broken names', () => {
    const score = sample() as unknown as { meta: { names: unknown } };
    score.meta.names = 'Mia';
    expect(parseScore(score, modul1)).toBeNull();
  });

  it('checks note values against the module: dotted notes only where allowed', () => {
    const dotted = (moduleId: string) => {
      const score = { ...sample(), moduleId };
      score.parts[0].staves[0].measures[1] = [
        { kind: 'note', pitches: [p('G4')], duration: { base: 48, dotted: true, triplet: false } },
        { kind: 'rest', duration: plain(24), auto: true },
        { kind: 'rest', duration: plain(96), auto: true },
      ];
      return score;
    };
    expect(parseScore(dotted('1'), modul1)).toBeNull();
    expect(parseScore(dotted('voll'), voll)).not.toBeNull();
  });

  it('rejects impossible note values (dotted whole, sixteenth triplet)', () => {
    for (const duration of [
      { base: 192, dotted: true, triplet: false },
      { base: 12, dotted: false, triplet: true },
      { base: 48, dotted: true, triplet: true },
    ]) {
      const score = { ...sample(), moduleId: 'voll' };
      score.parts[0].staves[0].measures[0][0] = { kind: 'note', pitches: [p('G4')], duration } as never;
      expect(parseScore(score, voll)).toBeNull();
    }
  });

  it('rejects more instruments or measures than the module allows', () => {
    const twoParts = sample();
    twoParts.parts.push({ ...structuredClone(twoParts.parts[0]), id: 'part-2' });
    expect(parseScore(twoParts, modul1)).toBeNull();
    expect(parseScore({ ...twoParts, moduleId: 'voll' }, voll)).not.toBeNull();

    const tooMany = { ...sample(), moduleId: 'voll' };
    const measures = tooMany.parts[0].staves[0].measures;
    while (measures.length < 33) measures.push(structuredClone(measures[1]));
    expect(parseScore(tooMany, voll)).toBeNull();
  });

  it('rejects staves with different numbers of measures', () => {
    const score = { ...sample(), moduleId: 'voll' };
    score.parts.push({ ...structuredClone(score.parts[0]), id: 'part-2' });
    score.parts[1].staves[0].measures.pop();
    expect(parseScore(score, voll)).toBeNull();
  });

  it('accepts a pickup in the full version, with the shortened last measure', () => {
    const score = ok(setPickup(createEmptyScore(voll), voll, 48));
    expect(parseScore(JSON.parse(JSON.stringify(score)), voll)).toEqual(score);
    const wrongLast = structuredClone(score);
    wrongLast.parts[0].staves[0].measures[8] = [{ kind: 'rest', duration: plain(192), auto: true }];
    expect(parseScore(wrongLast, voll)).toBeNull();
    expect(parseScore({ ...score, moduleId: '1' }, modul1)).toBeNull();
  });

  it('rejects broken triplet groups', () => {
    const score = createEmptyScore(voll);
    const t = { base: 24, dotted: false, triplet: true } as const;
    score.parts[0].staves[0].measures[0] = [
      { kind: 'note', pitches: [p('C4')], duration: t },
      { kind: 'rest', duration: t, auto: true },
      { kind: 'rest', duration: plain(12), auto: true },
      { kind: 'rest', duration: plain(48), auto: true },
      { kind: 'rest', duration: plain(96), auto: true },
    ];
    expect(parseScore(score, voll)).toBeNull();
  });

  it('chords only for the piano, instruments must be known', () => {
    const score = createEmptyScore(voll);
    score.parts[0].staves[0].measures[0] = [
      { kind: 'note', pitches: [p('C4'), p('E4')], duration: plain(48) },
      { kind: 'rest', duration: plain(48), auto: true },
      { kind: 'rest', duration: plain(96), auto: true },
    ];
    expect(parseScore(JSON.parse(JSON.stringify(score)), voll)).toEqual(score);
    expect(parseScore({ ...score, parts: [{ ...score.parts[0], instrument: 'oboe' }] }, voll)).toBeNull();
    const violin = structuredClone(score);
    violin.parts[0].instrument = 'violin';
    violin.parts[0].staves.pop();
    expect(parseScore(violin, voll)).toBeNull();
  });
});
