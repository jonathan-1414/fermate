import type { EditResult } from './edit';
import { isOutsideRange, TRANSPOSITION_LABELS } from './instruments';
import { diatonicIndex, pitchFromDiatonic, pitchToMidi } from './pitch';
import type { Part, Pitch, Score } from './types';

/**
 * Transposing instruments (CLAUDE.md, section 5, "Transponierende Instrumente"): the model
 * always stays sounding. "Transposed" is only how a part is shown: notes, key, note names
 * and input on its staff are in the written (fingered) picture, the app converts.
 */

export interface Transposition {
  /** Shown in the short name and on the switch: "Klar. (B)". */
  label: string;
  /** Written = sounding + this interval: steps on the staff and semitones. */
  steps: number;
  semitones: number;
  /** How the key signature moves (in fifths: +2 = two more sharps). */
  fifths: number;
}

const interval = (id: string, steps: number, semitones: number, fifths: number): Transposition => ({
  label: TRANSPOSITION_LABELS[id],
  steps,
  semitones,
  fifths,
});

export const TRANSPOSITIONS: Record<string, Transposition> = {
  clarinet: interval('clarinet', 1, 2, 2), // in B: a major second higher
  trumpet: interval('trumpet', 1, 2, 2),
  saxophone: interval('saxophone', 5, 9, 3), // in Es: a major sixth higher
  horn: interval('horn', 4, 7, 1), // in F: a fifth higher
  contrabass: interval('contrabass', 7, 12, 0), // an octave higher
};

type Fail = Extract<EditResult, { ok: false }>;
const fail = (error: Fail['error']): Fail => ({ ok: false, error });

/** Can this instrument be shown transposed? */
export function canTranspose(instrument: string): boolean {
  return instrument in TRANSPOSITIONS;
}

/** The transposition a part is shown with, or null (shown sounding). */
export function shownTransposition(part: Part | undefined): Transposition | null {
  return part?.transposed ? (TRANSPOSITIONS[part.instrument] ?? null) : null;
}

/**
 * Key and interval as written. More than 4 accidentals are allowed; beyond 6 the spelling
 * with fewer accidentals is taken (B major instead of C flat major, D flat instead of
 * C sharp major). Then the interval is spelled one step more or less (same sound).
 */
function written(t: Transposition, keySignature: number): { key: number; steps: number } {
  const key = keySignature + t.fifths;
  if (key > 6) return { key: key - 12, steps: t.steps + 1 };
  if (key < -6) return { key: key + 12, steps: t.steps - 1 };
  return { key, steps: t.steps };
}

/**
 * The pitch with this sound, spelled on the line `index` if that needs at most one sharp
 * or flat; otherwise on the neighbouring line (no double sharps or flats: they do not
 * exist in the model, e.g. e double flat becomes d).
 */
function spell(midi: number, index: number): Pitch {
  for (const i of [index, index + 1, index - 1]) {
    const natural = pitchFromDiatonic(i);
    const alter = midi - pitchToMidi(natural);
    if (alter >= -1 && alter <= 1) return { ...natural, alter: alter as -1 | 0 | 1 };
  }
  return pitchFromDiatonic(index); // never reached: a neighbour always fits
}

/** Sounding → written for a part (unchanged if it is shown sounding). */
export function toWritten(pitch: Pitch, part: Part | undefined, keySignature: number): Pitch {
  const t = shownTransposition(part);
  if (!t) return pitch;
  return spell(pitchToMidi(pitch) + t.semitones, diatonicIndex(pitch) + written(t, keySignature).steps);
}

/** Written → sounding for a part (unchanged if it is shown sounding). */
export function toSounding(pitch: Pitch, part: Part | undefined, keySignature: number): Pitch {
  const t = shownTransposition(part);
  if (!t) return pitch;
  return spell(pitchToMidi(pitch) - t.semitones, diatonicIndex(pitch) - written(t, keySignature).steps);
}

/** The key signature shown on each staff. */
export function staffKeys(score: Score): number[] {
  return score.parts.flatMap((part) => {
    const t = shownTransposition(part);
    const key = t ? written(t, score.keySignature).key : score.keySignature;
    return part.staves.map(() => key);
  });
}

/**
 * The score as it is shown: transposed parts with written pitches (only for drawing,
 * never saved). Ties stay, the order of chord tones too (all move by the same interval).
 */
export function writtenView(score: Score): Score {
  if (!score.parts.some((part) => shownTransposition(part))) return score;
  const copy = structuredClone(score);
  for (const part of copy.parts) {
    if (!shownTransposition(part)) continue;
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const event of measure) {
          if (event.kind === 'note') event.pitches = event.pitches.map((p) => toWritten(p, part, score.keySignature));
        }
      }
    }
  }
  return copy;
}

/** Is a written pitch (as shown) outside the instrument's range? */
export function isWrittenOutsideRange(part: Part | undefined, pitch: Pitch, keySignature: number): boolean {
  return isOutsideRange(part, toSounding(pitch, part, keySignature));
}

/** Switch in the settings: show the part transposed or sounding (an undo step). */
export function setTransposed(score: Score, index: number, on: boolean): EditResult {
  const part = score.parts[index];
  if (!part) return fail('invalid-position');
  if (!canTranspose(part.instrument)) return fail('not-allowed');
  const copy = structuredClone(score);
  if (on) copy.parts[index].transposed = true;
  else delete copy.parts[index].transposed;
  return { ok: true, score: copy };
}
