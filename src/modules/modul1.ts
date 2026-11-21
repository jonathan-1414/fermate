import type { ModuleConfig } from './types';

export const modul1: ModuleConfig = {
  id: '1',
  name: 'Modul 1',
  maxParts: 1,
  maxStaves: 1,
  measures: 4,
  minMeasures: 4,
  maxMeasures: 4,
  timeSignatures: ['4/4'],
  keySignatures: [0],
  durations: [192, 96, 48, 24], // whole, half, quarter, eighth
  dotted: false,
  triplets: false,
  ties: false,
  pickup: false,
  manualRests: false,
  accidentals: [],
  range: { low: 'C4', high: 'F5' }, // c' to f''
  tempoFixed: 90,
  exportFormats: ['fermate', 'pdf'],
  showRests: false,
  overwrite: false,
  measureCheck: true,
};
