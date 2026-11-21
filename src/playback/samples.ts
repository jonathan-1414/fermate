/**
 * Which recorded notes each instrument has (public/samples/<folder>/<note>.mp3, see
 * LICENSE.txt there). Only a selection: the sampler computes the notes in between.
 * File names use "s" for sharp (Cs4 = C#4), as in tonejs-instruments.
 */
export interface SampleSet {
  /** Note name (as Tone.js reads it) → path below public/samples/. */
  urls: Record<string, string>;
  release: number;
}

const set = (folder: string, notes: string, release = 1): SampleSet => ({
  urls: Object.fromEntries(notes.split(' ').map((n) => [n.replace('s', '#'), `${folder}/${n}.mp3`])),
  release,
});

/** Modul 1: only c' to f'' (11 files), as before. */
export const MODUL1_PIANO = set('piano', 'C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5');

export const SAMPLES: Record<string, SampleSet> = {
  piano: set('piano', 'C1 E1 Gs1 C2 E2 Gs2 C3 E3 Gs3 C4 E4 Gs4 C5 E5 Gs5 C6 E6 Gs6 C7 E7 Gs7 C8'),
  flute: set('flute', 'C4 E4 A4 C5 E5 A5 C6 E6 A6 C7', 0.4),
  clarinet: set('clarinet', 'D3 F3 As3 D4 F4 As4 D5 F5 As5 D6 Fs6', 0.4),
  saxophone: set('saxophone', 'Cs3 F3 As3 D4 Fs4 As4 D5 Fs5', 0.4),
  bassoon: set('bassoon', 'G2 A2 C3 G3 A3 C4 E4 G4 A4 C5', 0.4),
  horn: set('horn', 'A1 C2 Ds2 G2 D3 F3 A3 C4 D5 F5', 0.5),
  trumpet: set('trumpet', 'F3 A3 C4 Ds4 F4 G4 As4 D5 F5 A5 C6', 0.4),
  trombone: set('trombone', 'As1 Ds2 Gs2 C3 Ds3 Gs3 C4 F4', 0.4),
  tuba: set('tuba', 'F1 As1 Ds2 F2 As2 D3 F3 As3 D4', 0.4),
  violin: set('violin', 'G3 C4 E4 A4 C5 E5 A5 C6 E6 A6 C7', 0.5),
  // The viola has no recordings of its own: low notes from the cello, high ones from the violin.
  viola: {
    urls: { ...set('cello', 'C3 E3 Gs3 C4').urls, ...set('violin', 'A4 C5 E5 A5 C6 E6').urls },
    release: 0.5,
  },
  cello: set('cello', 'C2 E2 Gs2 C3 E3 Gs3 C4 E4 Gs4 C5', 0.5),
  contrabass: set('contrabass', 'Fs1 As1 D2 E2 Gs2 Cs3 E3 Gs3 B3', 0.5),
};
