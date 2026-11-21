export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

/** A pitch in scientific notation: c' = C4, f'' = F5. */
export interface Pitch {
  step: Step;
  alter: -1 | 0 | 1; // flat, natural, sharp
  octave: number;
}

/** Plain note values in ticks: whole, half, quarter, eighth, sixteenth. */
export type BaseValue = 192 | 96 | 48 | 24 | 12;

/**
 * A note value as the user chose it. The length in ticks is computed from it
 * (see duration.ts). Dotted only for half, quarter and eighth; triplet only for
 * quarter and eighth; never dotted and triplet together.
 */
export interface Duration {
  base: BaseValue;
  dotted: boolean;
  triplet: boolean;
}

/**
 * One event in a measure. Called ScoreEvent (not Event as in CLAUDE.md)
 * because the browser already has a built-in type named Event.
 */
export type ScoreEvent =
  | {
      kind: 'note';
      /** Sorted from low to high, no duplicates; more than one only where chords are allowed. */
      pitches: Pitch[];
      duration: Duration;
      tieToNext?: boolean;
    }
  | { kind: 'rest'; duration: Duration; auto: boolean }; // auto = gap filled by the app

export interface Staff {
  id: string;
  clef: 'treble' | 'bass';
  measures: ScoreEvent[][];
}

/** One instrument with its staves (piano: two). Volume, mute and solo belong to it. */
export interface Part {
  id: string;
  instrument: string;
  staves: Staff[];
  volume: number; // 0..1
  mute: boolean;
  solo: boolean;
}

export interface TimeSignature {
  beats: number;
  beatValue: number;
}

export interface Score {
  format: 'fermate';
  version: 2;
  meta: { title: string; names: string[]; className: string };
  moduleId: string;
  timeSignature: TimeSignature;
  keySignature: number;
  /** Length of the pickup measure in ticks, 0 = no pickup. */
  pickup: number;
  tempo: number;
  swing: boolean;
  parts: Part[];
}

/**
 * Where something sits in the score: staff index (counted over all parts from the
 * top, see staves.ts), measure index, start tick in the measure.
 */
export interface Position {
  staff: number;
  measure: number;
  tick: number;
}
