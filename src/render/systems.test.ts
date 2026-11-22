import { describe, expect, it } from 'vitest';
import { breakIntoSystems, stretchFactor } from './systems';

describe('lines for printing', () => {
  it('puts as many measures on a line as fit', () => {
    expect(breakIntoSystems([100, 100, 100, 100, 100], 250, 0)).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('the first line has less room (time signature)', () => {
    expect(breakIntoSystems([100, 100, 100, 100], 300, 60)).toEqual([[0, 1], [2, 3]]);
  });

  it('a measure wider than the line gets a line of its own', () => {
    expect(breakIntoSystems([50, 400, 50], 300, 0)).toEqual([[0], [1], [2]]);
  });

  it('lines are stretched to the full width, a short last line is not', () => {
    expect(stretchFactor(200, 300, false)).toBe(1.5);
    expect(stretchFactor(100, 300, true)).toBe(1);
    expect(stretchFactor(250, 300, true)).toBe(1.2);
    expect(stretchFactor(400, 300, false)).toBe(0.75);
  });
});
