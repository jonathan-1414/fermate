import type { Part, Score, Staff } from './types';

/** All staves from top to bottom, over all parts. A Position's staff index counts in this list. */
export function allStaves(score: Score): Staff[] {
  return score.parts.flatMap((part) => part.staves);
}

export function staffAt(score: Score, index: number): Staff | undefined {
  return allStaves(score)[index];
}

/** The part (instrument) that the staff with this index belongs to. */
export function partOfStaff(score: Score, index: number): Part | undefined {
  let first = 0;
  for (const part of score.parts) {
    if (index < first + part.staves.length) return part;
    first += part.staves.length;
  }
  return undefined;
}
