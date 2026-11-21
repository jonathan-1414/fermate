import type { ModuleConfig } from '../modules/types';
import { eventTicks, isValidDuration } from './duration';
import { measureLength } from './measure';
import { isInRange } from './pitch';
import type { Duration, Pitch, Score, ScoreEvent } from './types';

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
  // The pickup is not used yet (it comes with the full version's input rules).
  if (data.pickup !== 0) return null;

  const length = measureLength({ beats: Number(ts.beats), beatValue: Number(ts.beatValue) });
  const parts = data.parts;
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > module.maxParts) return null;
  let staffCount = 0;
  let measureCount: number | null = null;
  for (const part of parts) {
    if (!isObject(part) || typeof part.id !== 'string' || typeof part.instrument !== 'string') return null;
    if (typeof part.volume !== 'number' || typeof part.mute !== 'boolean' || typeof part.solo !== 'boolean') {
      return null;
    }
    const staves = part.staves;
    if (!Array.isArray(staves) || staves.length < 1) return null;
    for (const staff of staves) {
      staffCount++;
      if (!isObject(staff) || typeof staff.id !== 'string') return null;
      if (staff.clef !== 'treble' && staff.clef !== 'bass') return null;
      const measures = staff.measures;
      if (!Array.isArray(measures)) return null;
      if (measures.length < module.minMeasures || measures.length > module.maxMeasures) return null;
      // All staves have the same number of measures.
      if (measureCount !== null && measures.length !== measureCount) return null;
      measureCount = measures.length;
      for (const measure of measures) {
        if (!Array.isArray(measure) || !measure.every((e) => isValidEvent(e, module))) return null;
        if ((measure as ScoreEvent[]).reduce((sum, e) => sum + eventTicks(e), 0) !== length) return null;
      }
    }
  }
  if (staffCount > module.maxStaves) return null;
  return structuredClone(data) as unknown as Score;
}

function isValidEvent(e: unknown, module: ModuleConfig): boolean {
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
  // Chords come with the instruments (later step); until then one pitch per note.
  if (!Array.isArray(pitches) || pitches.length !== 1) return false;
  return pitches.every((p) => isValidPitch(p) && isInRange(p as Pitch, module.range));
}

function isValidPitch(p: unknown): boolean {
  if (!isObject(p) || !['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(p.step as string)) return false;
  return [-1, 0, 1].includes(p.alter as number) && Number.isInteger(p.octave);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
