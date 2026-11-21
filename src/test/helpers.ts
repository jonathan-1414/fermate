import { eventTicks } from '../model/duration';
import { placeEvents } from '../model/measure';
import { parsePitch } from '../model/pitch';
import type { Pitch, ScoreEvent } from '../model/types';

export const p = (text: string): Pitch => parsePitch(text);

/** Short, readable form of a measure: 'n48@0 C4' = quarter note C4 at tick 0, 'r96@96' = auto rest. */
export function describe(measure: ScoreEvent[]): string[] {
  return placeEvents(measure).map(({ start, event }) =>
    event.kind === 'note'
      ? `n${eventTicks(event)}@${start} ${event.pitches.map((x) => `${x.step}${x.octave}`).join('+')}`
      : `${event.auto ? 'r' : 'R'}${eventTicks(event)}@${start}`,
  );
}
