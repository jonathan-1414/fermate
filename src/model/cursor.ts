import { firstFreeTick, isOccupant, measureLength, placeEvents } from './measure';
import { staffAt } from './staves';
import type { Position, Score } from './types';

/**
 * Where the cursor goes after a note was placed in this measure: behind the last note,
 * where the next one would be appended. If the measure is now full, on to the
 * first free spot of the next measure (the last measure keeps the cursor at its end).
 */
export function advanceCursor(score: Score, at: Position): Position {
  const measures = staffAt(score, at.staff)!.measures;
  const free = firstFreeTick(measures[at.measure]);
  if (free !== null) return { ...at, tick: free };
  if (at.measure === measures.length - 1) return { ...at, tick: measureLength(score.timeSignature) };
  const next = at.measure + 1;
  return { staff: at.staff, measure: next, tick: firstFreeTick(measures[next]) ?? 0 };
}

/**
 * Where a note goes when the finger touches the column of the event that starts at `tick`.
 * On a note or set rest: there (it gets replaced). In a gap: behind the last event,
 * because the events of a measure always stand together from the start.
 */
export function positionForTap(score: Score, staff: number, measure: number, tick: number): Position {
  const events = staffAt(score, staff)!.measures[measure];
  const onEvent = placeEvents(events).some((p) => p.start === tick && isOccupant(p.event));
  if (onEvent) return { staff, measure, tick };
  return { staff, measure, tick: firstFreeTick(events) ?? measureLength(score.timeSignature) };
}

/** Cursor when a score is opened: behind the last note of the first measure that is not full. */
export function initialCursor(score: Score, staff = 0): Position {
  const measures = staffAt(score, staff)!.measures;
  for (let measure = 0; measure < measures.length; measure++) {
    const free = firstFreeTick(measures[measure]);
    if (free !== null) return { staff, measure, tick: free };
  }
  return { staff, measure: measures.length - 1, tick: measureLength(score.timeSignature) };
}
