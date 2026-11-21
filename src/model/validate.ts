import type { ModuleConfig } from '../modules/types';
import { eventTicks, isValidDuration } from './duration';
import { toItems } from './items';
import { isValidPickup, measureLengths } from './meter';
import { entryRange, instrumentById } from './instruments';
import { pitchToMidi } from './pitch';
import type { Duration, Part, Pitch, Score, ScoreEvent } from './types';

/**
 * Checks data read from outside (browser storage, later files) before the app uses it.
 * Returns the score if it is a complete, valid score for this module, otherwise null.
 * The app never trusts stored data blindly: a broken score must not break the app.
 */
export function parseScore(data: unknown, module: ModuleConfig): Score | null {
  if (!isObject(data)) return null;
  if (data.format !== 'fermate' || data.version !== 2 || data.moduleId !== module.id) return null;

  const meta = data.meta;
  if (!isObject(meta) || typeof meta.title !== 'string' || typeof meta.className !== 'string') return null;
  if (!Array.isArray(meta.names) || !meta.names.every((n) => typeof n === 'string')) return null;

  const ts = data.timeSignature;
  if (!isObject(ts) || !module.timeSignatures.includes(`${ts.beats}/${ts.beatValue}`)) return null;
  if (typeof data.keySignature !== 'number' || !module.keySignatures.includes(data.keySignature)) return null;
  if (typeof data.tempo !== 'number' || typeof data.swing !== 'boolean') return null;
  const timeSignature = { beats: Number(ts.beats), beatValue: Number(ts.beatValue) };
  if (typeof data.pickup !== 'number' || !isValidPickup(timeSignature, data.pickup)) return null;
  if (data.pickup !== 0 && !module.pickup) return null;
  const parts = data.parts;
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > module.maxParts) return null;
  let staffCount = 0;
  let measureCount: number | null = null;
  for (const part of parts) {
    if (!isObject(part) || typeof part.id !== 'string' || typeof part.instrument !== 'string') return null;
    if (typeof part.volume !== 'number' || typeof part.mute !== 'boolean' || typeof part.solo !== 'boolean') {
      return null;
    }
    const instrument = instrumentById(part.instrument);
    if (module.overwrite && !instrument) return null;
    const staves = part.staves;
    if (!Array.isArray(staves) || staves.length < 1 || staves.length > (instrument?.clefs.length ?? 1)) return null;
    const range = entryRange(module, part as unknown as Part);
    const chords = instrument?.chords === true && module.overwrite;
    for (const staff of staves) {
      staffCount++;
      if (!isObject(staff) || typeof staff.id !== 'string') return null;
      if (staff.clef !== 'treble' && staff.clef !== 'bass') return null;
      const measures = staff.measures;
      if (!Array.isArray(measures)) return null;
      if (measures.length < module.minMeasures || measures.length > module.maxMeasures) return null;
      if (data.pickup !== 0 && measures.length < 2) return null;
      const lengths = measureLengths(timeSignature, data.pickup, measures.length);
      // All staves have the same number of measures.
      if (measureCount !== null && measures.length !== measureCount) return null;
      measureCount = measures.length;
      for (const [i, measure] of measures.entries()) {
        if (!Array.isArray(measure) || !measure.every((e) => isValidEvent(e, module, range, chords))) return null;
        if ((measure as ScoreEvent[]).reduce((sum, e) => sum + eventTicks(e), 0) !== lengths[i]) return null;
        // Triplets always come as complete groups of three of the same kind.
        if (!toItems(measure as ScoreEvent[])) return null;
      }
    }
  }
  if (staffCount > module.maxStaves) return null;
  return structuredClone(data) as unknown as Score;
}

function isValidEvent(e: unknown, module: ModuleConfig, range: { low: number; high: number }, chords: boolean): boolean {
  if (!isObject(e) || !isObject(e.duration) || !isValidDuration(e.duration as unknown as Duration)) return false;
  const d = e.duration as unknown as Duration;
  if (e.kind === 'rest' && e.auto === true) return true; // gaps: any value the app uses
  if (!module.durations.includes(d.base)) return false;
  if ((d.dotted && !module.dotted) || (d.triplet && !module.triplets)) return false;
  // Set rests are kept even if the link does not allow setting new ones (nothing gets lost).
  if (e.kind === 'rest') return e.auto === false;
  if (e.kind !== 'note' || (e.tieToNext !== undefined && typeof e.tieToNext !== 'boolean')) return false;
  if (e.tieToNext && !module.ties) return false;
  const pitches = e.pitches;
  if (!Array.isArray(pitches) || pitches.length < 1 || (pitches.length > 1 && !chords)) return false;
  return pitches.every((p) => isValidPitch(p) && pitchToMidi(p as Pitch) >= range.low && pitchToMidi(p as Pitch) <= range.high);
}

function isValidPitch(p: unknown): boolean {
  if (!isObject(p) || !['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(p.step as string)) return false;
  return [-1, 0, 1].includes(p.alter as number) && Number.isInteger(p.octave);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
