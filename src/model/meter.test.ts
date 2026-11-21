import { describe, expect, it } from 'vitest';
import { durationTicks } from './duration';
import { beatLength, durationOfTicks, isValidPickup, measureLengths, splitIntoValues } from './meter';

const ts = (text: string) => {
  const [beats, beatValue] = text.split('/').map(Number);
  return { beats, beatValue };
};
/** 'ticks@start' for each piece. */
const split = (start: number, end: number, meter: string) =>
  splitIntoValues(start, end, ts(meter)).map((p) => `${durationTicks(p.duration)}@${p.start}`);

describe('time signatures', () => {
  it('knows the beat: quarter, half in 2/2, dotted quarter in 6/8', () => {
    expect(['4/4', '3/4', '2/4', '2/2', '6/8'].map((t) => beatLength(ts(t)))).toEqual([48, 48, 48, 96, 72]);
  });

  it('shortens the last measure by the pickup', () => {
    expect(measureLengths(ts('4/4'), 0, 3)).toEqual([192, 192, 192]);
    expect(measureLengths(ts('4/4'), 48, 4)).toEqual([48, 192, 192, 144]);
    expect(measureLengths(ts('6/8'), 24, 3)).toEqual([24, 144, 120]);
  });

  it('allows pickups in quarters, in 6/8 in eighths, shorter than a measure', () => {
    expect([0, 48, 96, 144].map((p) => isValidPickup(ts('4/4'), p))).toEqual([true, true, true, true]);
    expect([24, 192, -48].map((p) => isValidPickup(ts('4/4'), p))).toEqual([false, false, false]);
    expect([24, 48, 120].map((p) => isValidPickup(ts('6/8'), p))).toEqual([true, true, true]);
    expect(isValidPickup(ts('3/4'), 144)).toBe(false);
  });

  it('finds single values for lengths', () => {
    expect(durationOfTicks(72)).toEqual({ base: 48, dotted: true, triplet: false });
    expect(durationOfTicks(144)).toEqual({ base: 96, dotted: true, triplet: false });
    expect(durationOfTicks(60)).toBeNull();
  });
});

describe('rests by the beats', () => {
  it('4/4: never a rest over the middle of the measure', () => {
    expect(split(48, 192, '4/4')).toEqual(['48@48', '96@96']); // quarter, half
    expect(split(0, 144, '4/4')).toEqual(['96@0', '48@96']);
    expect(split(48, 144, '4/4')).toEqual(['48@48', '48@96']); // not a half rest over beat 3
  });

  it('4/4: after a dotted quarter come eighth and half', () => {
    expect(split(72, 192, '4/4')).toEqual(['24@72', '96@96']);
  });

  it('4/4: sixteenths fill up to the next eighth', () => {
    expect(split(12, 48, '4/4')).toEqual(['12@12', '24@24']);
  });

  it('3/4: two quarters after the first beat', () => {
    expect(split(48, 144, '3/4')).toEqual(['48@48', '48@96']);
  });

  it('2/2: quarter, then half', () => {
    expect(split(48, 192, '2/2')).toEqual(['48@48', '96@96']);
  });

  it('6/8: dotted quarters per half measure, nothing crosses a beat', () => {
    expect(split(24, 144, '6/8')).toEqual(['48@24', '72@72']);
    expect(split(0, 48, '6/8')).toEqual(['48@0']);
    expect(split(48, 144, '6/8')).toEqual(['24@48', '72@72']);
    expect(split(36, 72, '6/8')).toEqual(['12@36', '24@48']);
  });
});
