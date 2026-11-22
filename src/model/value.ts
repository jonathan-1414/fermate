import { eventTicks } from './duration';
import { groupAt, itemEnd, toItems } from './items';
import { fullMeasureLength } from './meter';
import { staffAt } from './staves';
import type { Duration, Position, Score } from './types';

/**
 * Which value the bottom toolbar shows in the full version (CLAUDE.md, section 5,
 * "Leiste folgt der Auswahl", "Ganztaktpause angetippt", "Punkt und Triole").
 */

/** Is the cursor on the single rest of an empty full measure (drawn as whole-measure rest)? */
export function isWholeMeasureRest(score: Score, at: Position): boolean {
  const measure = staffAt(score, at.staff)?.measures[at.measure];
  if (!measure || measure.length !== 1 || at.tick !== 0) return false;
  const [event] = measure;
  return event.kind === 'rest' && eventTicks(event) === fullMeasureLength(score.timeSignature);
}

/**
 * After a note was written at `written` and the cursor went on to `next`: has the
 * cursor left the triplet group of that note (the group is written to its end)?
 * True as well if the note was not in a group.
 */
export function leftTripletGroup(score: Score, written: Position, next: Position): boolean {
  const measure = staffAt(score, written.staff)?.measures[written.measure];
  const items = measure ? toItems(measure) : null;
  const group = items ? groupAt(items, written.tick) : null;
  if (!group) return true;
  const inside = next.staff === written.staff && next.measure === written.measure && next.tick >= group.start && next.tick < itemEnd(group);
  return !inside;
}

/**
 * The value to go on writing with after a note was set: a dot chosen with "Punkt"
 * counts for this one note only; a triplet ends with its group.
 */
export function valueAfterWriting(written: Duration, dotOnce: boolean, groupLeft: boolean): Duration {
  if (written.dotted && dotOnce) return { ...written, dotted: false };
  if (written.triplet && groupLeft) return { ...written, triplet: false };
  return written;
}
