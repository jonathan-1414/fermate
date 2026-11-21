import { shareAPitch, staffEvents } from './sequence';
import type { Pitch, Staff, Step } from './types';

/** Order in which sharps and flats appear in a key signature. */
const SHARPS: Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLATS: Step[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** What the key does to this step: in G major (1) F → +1, in F major (-1) B → -1. */
export function keyAlter(step: Step, keySignature: number): -1 | 0 | 1 {
  if (keySignature > 0 && SHARPS.slice(0, keySignature).includes(step)) return 1;
  if (keySignature < 0 && FLATS.slice(0, -keySignature).includes(step)) return -1;
  return 0;
}

/** The pitch on this line or space as the key makes it: new notes follow the key. */
export function inKey(pitch: Pitch, keySignature: number): Pitch {
  return { ...pitch, alter: keyAlter(pitch.step, keySignature) };
}

export type AccidentalSign = 'sharp' | 'flat' | 'natural';

const SIGN: Record<-1 | 0 | 1, AccidentalSign> = { [-1]: 'flat', 0: 'natural', 1: 'sharp' };

/**
 * Which notes need an accidental in front, by the usual rule: an accidental holds
 * until the end of the measure (for that line or space); afterwards the key applies
 * again. A note tied over from before gets no sign. No courtesy accidentals.
 * Result: [measure][event][pitch] → sign or null.
 */
export function accidentalsForStaff(staff: Staff, keySignature: number): Array<Array<Array<AccidentalSign | null>>> {
  const events = staffEvents(staff);
  const result = staff.measures.map((measure) => measure.map(() => [] as Array<AccidentalSign | null>));
  let state = new Map<string, number>();
  let currentMeasure = -1;
  events.forEach(({ measure, event }, i) => {
    if (measure !== currentMeasure) {
      state = new Map();
      currentMeasure = measure;
    }
    const indexInMeasure = events.slice(0, i).filter((e) => e.measure === measure).length;
    if (event.kind !== 'note') return;
    const prev = events[i - 1]?.event;
    const tiedFromBefore = prev?.kind === 'note' && prev.tieToNext === true && shareAPitch(prev, event);
    result[measure][indexInMeasure] = event.pitches.map((p) => {
      const line = `${p.step}${p.octave}`;
      if (tiedFromBefore && prev.kind === 'note' && prev.pitches.some((q) => q.step === p.step && q.octave === p.octave && q.alter === p.alter)) {
        return null;
      }
      const current = state.get(line) ?? keyAlter(p.step, keySignature);
      state.set(line, p.alter);
      return p.alter === current ? null : SIGN[p.alter];
    });
  });
  return result;
}
