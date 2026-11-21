import type { ModuleConfig } from '../modules/types';
import type { EditResult } from './edit';
import { addPart, removePart } from './instruments';
import { setKeySignature, setPickup, setTimeSignature } from './measures';
import { createEmptyScore } from './score';
import type { Score } from './types';

/** What the start wizard of the full version asks for (pages 2 and 3). */
export interface ScoreSetup {
  instruments: string[]; // instrument ids, in the order chosen (the score order is made by the app)
  timeSignature: string; // e.g. '4/4'
  keySignature: number;
  pickup: number; // ticks, 0 = no pickup
  tempo: number; // quarters per minute
}

/**
 * A new, empty score as chosen in the start wizard. Fails if the choice is not
 * possible (no instrument, more than 5, the piano twice, a pickup that does not fit).
 */
export function createConfiguredScore(module: ModuleConfig, setup: ScoreSetup): EditResult {
  if (setup.instruments.length === 0) return { ok: false, error: 'last-instrument' };
  let score: Score = createEmptyScore(module);
  const steps: Array<(s: Score) => EditResult> = [
    (s) => setTimeSignature(s, module, setup.timeSignature),
    (s) => setKeySignature(s, module, setup.keySignature),
    (s) => setPickup(s, module, setup.pickup),
  ];
  // The new score starts with a piano: keep it only if the piano was chosen.
  const others = [...setup.instruments];
  const pianoIndex = others.indexOf('piano');
  const keepPiano = pianoIndex >= 0;
  if (keepPiano) others.splice(pianoIndex, 1);
  for (const id of others) steps.push((s) => addPart(s, module, id));
  if (!keepPiano) steps.push((s) => removePart(s, s.parts.findIndex((p) => p.instrument === 'piano')));
  for (const step of steps) {
    const result = step(score);
    if (!result.ok) return result;
    score = result.score;
  }
  return { ok: true, score: { ...score, tempo: setup.tempo } };
}
