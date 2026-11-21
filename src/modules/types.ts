export type ExportFormat = 'fermate' | 'pdf';

/** A module decides which features the app shows and which inputs the model accepts. */
export interface ModuleConfig {
  id: string;
  name: string;
  maxParts: number; // instruments
  maxStaves: number; // staves over all instruments
  measures: number; // measures of a new score
  minMeasures: number;
  maxMeasures: number;
  timeSignatures: string[]; // e.g. '4/4'
  keySignatures: number[]; // number of sharps (+) or flats (-)
  durations: number[]; // allowed plain note values in ticks
  dotted: boolean;
  triplets: boolean;
  ties: boolean;
  pickup: boolean;
  manualRests: boolean;
  accidentals: Array<-1 | 1>;
  range: { low: string; high: string }; // e.g. 'C4'
  tempoFixed: number | null; // null = tempo can be changed
  exportFormats: ExportFormat[];
  /** Automatic rests are drawn (full version) or left empty (Modul 1). */
  showRests: boolean;
  /** Input overwrites (full version) instead of notes moving together (Modul 1). */
  overwrite: boolean;
  /** Tick or dashed circle below each measure (Modul 1). */
  measureCheck: boolean;
}
