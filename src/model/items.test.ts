import { describe, expect, it } from 'vitest';
import { describe as show, p } from '../test/helpers';
import { plain } from './duration';
import { fromItems, toItems } from './items';
import type { ScoreEvent } from './types';

const ts = { beats: 4, beatValue: 4 };
const tri = (kind: 'note' | 'rest'): ScoreEvent =>
  kind === 'note'
    ? { kind: 'note', pitches: [p('C4')], duration: { base: 24, dotted: false, triplet: true } }
    : { kind: 'rest', duration: { base: 24, dotted: false, triplet: true }, auto: true };
const rest = (ticks: number): ScoreEvent => ({ kind: 'rest', duration: plain(ticks), auto: true });

describe('measure as notes and triplet groups', () => {
  it('reads and writes a measure back unchanged', () => {
    const measure: ScoreEvent[] = [tri('note'), tri('rest'), tri('note'), rest(48), rest(96)];
    const items = toItems(measure)!;
    expect(items.map((i) => [i.type, i.start])).toEqual([['group', 0]]);
    expect(fromItems(items, 192, ts)).toEqual(measure);
  });

  it('finds broken triplets: incomplete or mixed groups', () => {
    expect(toItems([tri('note'), tri('rest'), rest(24), rest(48), rest(96)])).toBeNull();
    const quarterTriplet: ScoreEvent = { kind: 'rest', duration: { base: 48, dotted: false, triplet: true }, auto: true };
    expect(toItems([tri('note'), tri('rest'), quarterTriplet])).toBeNull();
  });

  it('rewrites the rests by the beats', () => {
    const measure: ScoreEvent[] = [rest(24), rest(24), { kind: 'note', pitches: [p('E4')], duration: plain(48) }, rest(96)];
    expect(show(fromItems(toItems(measure)!, 192, ts))).toEqual(['r48@0', 'n48@48 E4', 'r96@96']);
  });

  it('a shortened measure (pickup, last measure) gets no whole-measure rest', () => {
    expect(show(fromItems([], 48, ts))).toEqual(['r48@0']);
    expect(show(fromItems([], 144, ts))).toEqual(['r96@0', 'r48@96']);
  });
});
