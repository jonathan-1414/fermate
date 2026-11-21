import { eventTicks } from '../model/duration';
import { placeEvents } from '../model/measure';
import { parsePitch } from '../model/pitch';
import type { EditResult } from '../model/edit';
import type { Pitch, Score, ScoreEvent } from '../model/types';

export const p = (text: string): Pitch => parsePitch(text);

/**
 * Short, readable form of a measure: 'n48@0 C4' = quarter note C4 at tick 0, 'r96@96' = auto rest,
 * 'R48@0' = set rest, a '~' at the end = tied to the next note.
 */
export function describe(measure: ScoreEvent[]): string[] {
  return placeEvents(measure).map(({ start, event }) =>
    event.kind === 'note'
      ? `n${eventTicks(event)}@${start} ${event.pitches.map((x) => `${x.step}${x.alter === 1 ? '#' : x.alter === -1 ? 'b' : ''}${x.octave}`).join('+')}${event.tieToNext ? '~' : ''}`
      : `${event.auto ? 'r' : 'R'}${eventTicks(event)}@${start}`,
  );
}

/** The score of a successful edit (the test fails with the reason otherwise). */
export function ok(result: EditResult): Score {
  if (!result.ok) throw new Error(result.error);
  return result.score;
}
