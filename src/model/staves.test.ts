import { describe, expect, it } from 'vitest';
import { createEmptyScore } from './score';
import { allStaves, partOfStaff, staffAt } from './staves';
import { voll } from '../modules/voll';

describe('staves over all instruments', () => {
  it('counts staves from the top over all parts', () => {
    const score = createEmptyScore(voll);
    const piano = score.parts[0];
    piano.staves.push({ ...structuredClone(piano.staves[0]), id: 'staff-2', clef: 'bass' });
    score.parts.push({ ...structuredClone(piano), id: 'part-2', instrument: 'violin', staves: [structuredClone(piano.staves[0])] });

    expect(allStaves(score).map((s) => s.clef)).toEqual(['treble', 'bass', 'treble']);
    expect(staffAt(score, 1)?.id).toBe('staff-2');
    expect([0, 1, 2].map((i) => partOfStaff(score, i)?.instrument)).toEqual(['piano', 'piano', 'violin']);
    expect(staffAt(score, 3)).toBeUndefined();
    expect(partOfStaff(score, 3)).toBeUndefined();
  });
});
