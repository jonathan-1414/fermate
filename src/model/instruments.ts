import type { ModuleConfig } from '../modules/types';
import type { EditResult } from './edit';
import { fromItems } from './items';
import { measureLengths } from './meter';
import { parsePitch, pitchToMidi } from './pitch';
import type { Part, Pitch, Score, Staff } from './types';

/**
 * The instruments of the full version (CLAUDE.md, section 5). Everything that belongs
 * to an instrument for good is here, not in the file: German name, short name, clef(s),
 * range (always sounding, notation is never transposed), whether chords are allowed.
 * The list is in the usual score order: woodwinds, brass, piano, strings.
 */
export interface Instrument {
  id: string;
  name: string;
  short: string;
  clefs: Array<'treble' | 'bass'>;
  /** Range of the instrument (sounding). Notes outside are allowed but marked. */
  range: { low: string; high: string };
  chords: boolean;
}

export const INSTRUMENTS: Instrument[] = [
  { id: 'flute', name: 'Flöte', short: 'Fl.', clefs: ['treble'], range: { low: 'C4', high: 'C7' }, chords: false },
  { id: 'clarinet', name: 'Klarinette', short: 'Klar.', clefs: ['treble'], range: { low: 'D3', high: 'G6' }, chords: false },
  { id: 'saxophone', name: 'Saxofon', short: 'Sax.', clefs: ['treble'], range: { low: 'Db3', high: 'Ab5' }, chords: false },
  { id: 'bassoon', name: 'Fagott', short: 'Fag.', clefs: ['bass'], range: { low: 'Bb1', high: 'Eb5' }, chords: false },
  { id: 'horn', name: 'Horn', short: 'Hr.', clefs: ['treble'], range: { low: 'F2', high: 'F5' }, chords: false },
  { id: 'trumpet', name: 'Trompete', short: 'Trp.', clefs: ['treble'], range: { low: 'E3', high: 'Bb5' }, chords: false },
  { id: 'trombone', name: 'Posaune', short: 'Pos.', clefs: ['bass'], range: { low: 'E2', high: 'F5' }, chords: false },
  { id: 'tuba', name: 'Tuba', short: 'Tb.', clefs: ['bass'], range: { low: 'D1', high: 'F4' }, chords: false },
  { id: 'piano', name: 'Klavier', short: 'Klav.', clefs: ['treble', 'bass'], range: { low: 'A0', high: 'C8' }, chords: true },
  { id: 'violin', name: 'Violine', short: 'Vl.', clefs: ['treble'], range: { low: 'G3', high: 'E7' }, chords: false },
  { id: 'viola', name: 'Viola', short: 'Va.', clefs: ['treble'], range: { low: 'C3', high: 'E6' }, chords: false },
  { id: 'cello', name: 'Violoncello', short: 'Vc.', clefs: ['bass'], range: { low: 'C2', high: 'A5' }, chords: false },
  { id: 'contrabass', name: 'Kontrabass', short: 'Kb.', clefs: ['bass'], range: { low: 'E1', high: 'G4' }, chords: false },
];

export function instrumentById(id: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}

/**
 * Pitches that can be entered on a staff: the instrument's range and an octave more on
 * each side (those notes are marked), never more than the module allows (Modul 1: c'–f'').
 */
export function entryRange(module: ModuleConfig, part: Part | undefined): { low: number; high: number } {
  const moduleLow = pitchToMidi(parsePitch(module.range.low));
  const moduleHigh = pitchToMidi(parsePitch(module.range.high));
  const instrument = part && instrumentById(part.instrument);
  if (!instrument || !module.overwrite) return { low: moduleLow, high: moduleHigh };
  return {
    low: Math.max(moduleLow, pitchToMidi(parsePitch(instrument.range.low)) - 12),
    high: Math.min(moduleHigh, pitchToMidi(parsePitch(instrument.range.high)) + 12),
  };
}

/** Is the pitch outside the instrument's range (it is shown marked)? */
export function isOutsideRange(part: Part | undefined, pitch: Pitch): boolean {
  const instrument = part && instrumentById(part.instrument);
  if (!instrument) return false;
  const midi = pitchToMidi(pitch);
  return midi < pitchToMidi(parsePitch(instrument.range.low)) || midi > pitchToMidi(parsePitch(instrument.range.high));
}

/** Names as shown: "Violine 1", "Violine 2" when an instrument is there more than once. */
export function partNames(score: Score, short = false): string[] {
  return score.parts.map((part, i) => {
    const instrument = instrumentById(part.instrument);
    const name = (short ? instrument?.short : instrument?.name) ?? part.instrument;
    const same = score.parts.filter((p) => p.instrument === part.instrument);
    if (same.length < 2) return name;
    const number = score.parts.slice(0, i + 1).filter((p) => p.instrument === part.instrument).length;
    return `${name} ${number}`;
  });
}

/** Empty staves for a new part, with as many measures as the score has. */
function newPart(score: Score, instrument: Instrument, staves: number): Part {
  const count = score.parts[0]?.staves[0]?.measures.length ?? 0;
  const lengths = measureLengths(score.timeSignature, score.pickup, count);
  const emptyMeasure = (i: number): Staff['measures'][number] => fromItems([], lengths[i], score.timeSignature);
  const id = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: id('part'),
    instrument: instrument.id,
    volume: 1,
    mute: false,
    solo: false,
    staves: instrument.clefs.slice(0, staves).map((clef) => ({
      id: id('staff'),
      clef,
      measures: Array.from({ length: count }, (_, i) => emptyMeasure(i)),
    })),
  };
}


/**
 * Adds an instrument at its place in the score order (after others of the same kind).
 * The piano can only be there once.
 */
export function addPart(
  score: Score,
  module: ModuleConfig,
  instrumentId: string,
): EditResult {
  const instrument = instrumentById(instrumentId);
  if (!instrument) return { ok: false, error: 'unknown-instrument' };
  if (score.parts.length >= module.maxParts) return { ok: false, error: 'too-many-instruments' };
  if (instrumentId === 'piano' && score.parts.some((p) => p.instrument === 'piano')) return { ok: false, error: 'piano-only-once' };
  const staves = instrument.id === 'piano' ? Math.min(2, module.maxStaves) : 1;
  const copy = structuredClone(score);
  const order = (id: string) => INSTRUMENTS.findIndex((i) => i.id === id);
  const index = copy.parts.findIndex((p) => order(p.instrument) > order(instrumentId));
  const part = newPart(copy, instrument, staves);
  copy.parts.splice(index < 0 ? copy.parts.length : index, 0, part);
  if (copy.parts.reduce((n, p) => n + p.staves.length, 0) > module.maxStaves) return { ok: false, error: 'too-many-instruments' };
  return { ok: true, score: copy };
}

/** Removes an instrument with its notes; at least one stays. */
export function removePart(score: Score, index: number): EditResult {
  if (score.parts.length <= 1) return { ok: false, error: 'last-instrument' };
  const copy = structuredClone(score);
  copy.parts.splice(index, 1);
  return { ok: true, score: copy };
}

/**
 * Gives every instrument all its staves (full version): a piano saved with one staff
 * (from an earlier beta step) gets its bass staff back, empty. The notes stay.
 */
export function completeStaves(score: Score, module: ModuleConfig): Score {
  if (!module.overwrite) return score;
  const missing = score.parts.some((part) => part.staves.length < (instrumentById(part.instrument)?.clefs.length ?? 1));
  if (!missing) return score;
  const copy = structuredClone(score);
  const count = copy.parts[0].staves[0].measures.length;
  const lengths = measureLengths(copy.timeSignature, copy.pickup, count);
  for (const part of copy.parts) {
    const clefs = instrumentById(part.instrument)?.clefs ?? [];
    for (const clef of clefs.slice(part.staves.length)) {
      if (copy.parts.reduce((n, p) => n + p.staves.length, 0) >= module.maxStaves) break;
      part.staves.push({
        id: `staff-${Math.random().toString(36).slice(2, 10)}`,
        clef,
        measures: lengths.map((length) => fromItems([], length, copy.timeSignature)),
      });
    }
  }
  return copy;
}
