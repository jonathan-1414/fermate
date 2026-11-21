import type { ModuleConfig } from './types';

/**
 * The full version (beta, …/?modul=voll). Smaller modules are later made by
 * reducing this configuration. Being built step by step (CLAUDE.md, section 8):
 * some switches here are not used by the app yet.
 */
export const voll: ModuleConfig = {
  id: 'voll',
  name: 'Vollversion (Beta)',
  maxParts: 5,
  maxStaves: 6, // 5 instruments, the piano with two staves
  measures: 8,
  minMeasures: 1,
  maxMeasures: 32,
  timeSignatures: ['4/4', '3/4', '2/4', '6/8', '2/2'],
  keySignatures: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
  durations: [192, 96, 48, 24, 12], // whole to sixteenth
  dotted: true,
  triplets: true,
  ties: true,
  pickup: true,
  manualRests: false, // rests always come automatically
  accidentals: [-1, 1],
  range: { low: 'A0', high: 'C8' }, // until each instrument has its own range (step 6)
  tempoFixed: null,
  exportFormats: ['fermate', 'pdf'],
  showRests: true,
  overwrite: true,
  measureCheck: false,
};
