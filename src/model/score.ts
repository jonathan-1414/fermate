import type { ModuleConfig } from '../modules/types';
import { emptyMeasure, measureLength } from './measure';
import type { Score, TimeSignature } from './types';

export function parseTimeSignature(text: string): TimeSignature {
  const [beats, beatValue] = text.split('/').map(Number);
  return { beats, beatValue };
}

/**
 * A new, empty score as the module prescribes it: a piano (one staff in Modul 1,
 * two in the full version; the start wizard of the full version comes in a later step).
 */
export function createEmptyScore(module: ModuleConfig): Score {
  const timeSignature = parseTimeSignature(module.timeSignatures[0]);
  const length = measureLength(timeSignature);
  return {
    format: 'fermate',
    version: 2,
    meta: { title: '', names: [], className: '' },
    moduleId: module.id,
    timeSignature,
    keySignature: module.keySignatures.includes(0) ? 0 : module.keySignatures[0],
    pickup: 0,
    tempo: module.tempoFixed ?? 90,
    swing: false,
    parts: [
      {
        id: 'part-1',
        instrument: 'piano',
        volume: 1,
        mute: false,
        solo: false,
        // The piano has two staves where the module allows it (full version), else one.
        staves: (module.maxStaves >= 2 ? (['treble', 'bass'] as const) : (['treble'] as const)).map((clef, i) => ({
          id: `staff-${i + 1}`,
          clef,
          measures: Array.from({ length: module.measures }, () => emptyMeasure(length)),
        })),
      },
    ],
  };
}
