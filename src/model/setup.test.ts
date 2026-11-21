import { describe, expect, it } from 'vitest';
import { voll } from '../modules/voll';
import { describe as show, ok } from '../test/helpers';
import { createConfiguredScore } from './setup';

const base = { instruments: ['piano'], timeSignature: '4/4', keySignature: 0, pickup: 0, tempo: 90 };

describe('a new score from the start wizard', () => {
  it('has the chosen instruments in score order', () => {
    const score = ok(createConfiguredScore(voll, { ...base, instruments: ['violin', 'flute', 'piano', 'violin'] }));
    expect(score.parts.map((p) => p.instrument)).toEqual(['flute', 'piano', 'violin', 'violin']);
    expect(score.parts.map((p) => p.staves.length)).toEqual([1, 2, 1, 1]);
  });

  it('without the piano, no piano', () => {
    const score = ok(createConfiguredScore(voll, { ...base, instruments: ['cello'] }));
    expect(score.parts.map((p) => p.instrument)).toEqual(['cello']);
    expect(score.parts[0].staves[0].clef).toBe('bass');
  });

  it('time signature, key, pickup and tempo as chosen', () => {
    const score = ok(createConfiguredScore(voll, { ...base, timeSignature: '6/8', keySignature: -2, pickup: 24, tempo: 60 }));
    expect([score.timeSignature, score.keySignature, score.pickup, score.tempo]).toEqual([{ beats: 6, beatValue: 8 }, -2, 24, 60]);
    expect(show(score.parts[0].staves[0].measures[0])).toEqual(['r24@0']);
    expect(score.parts[0].staves[0].measures).toHaveLength(9);
  });

  it('refuses what is not possible', () => {
    expect(createConfiguredScore(voll, { ...base, instruments: [] }).ok).toBe(false);
    expect(createConfiguredScore(voll, { ...base, instruments: ['piano', 'piano'] })).toEqual({ ok: false, error: 'piano-only-once' });
    expect(createConfiguredScore(voll, { ...base, instruments: ['flute', 'flute', 'flute', 'flute', 'flute', 'flute'] })).toEqual({
      ok: false,
      error: 'too-many-instruments',
    });
  });
});
