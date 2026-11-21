import { eventTicks } from './duration';
import type { Pitch, Position, Score, ScoreEvent, Staff } from './types';
import { allStaves } from './staves';

/** All events of a staff in order, over all measures, with where they start. */
export interface Located {
  measure: number;
  tick: number;
  event: ScoreEvent;
}

export function staffEvents(staff: Staff): Located[] {
  const result: Located[] = [];
  staff.measures.forEach((measure, m) => {
    let tick = 0;
    for (const event of measure) {
      result.push({ measure: m, tick, event });
      tick += eventTicks(event);
    }
  });
  return result;
}

export function samePitch(a: Pitch, b: Pitch): boolean {
  return a.step === b.step && a.alter === b.alter && a.octave === b.octave;
}

/** Do two events share at least one pitch (a tie connects these)? */
export function shareAPitch(a: ScoreEvent, b: ScoreEvent): boolean {
  return a.kind === 'note' && b.kind === 'note' && a.pitches.some((p) => b.pitches.some((q) => samePitch(p, q)));
}

/**
 * Removes ties that no longer lead anywhere: a tie needs a note right after it
 * (also over the bar line) with a pitch in common. The last note has no tie.
 * Changes the given staff.
 */
export function cleanTies(staff: Staff): void {
  const events = staffEvents(staff);
  events.forEach(({ event }, i) => {
    if (event.kind !== 'note' || !event.tieToNext) return;
    const next = events[i + 1]?.event;
    if (!next || !shareAPitch(event, next)) delete event.tieToNext;
  });
}

/** Index in staffEvents of the event that starts at this position, or -1. */
export function indexAt(events: Located[], at: Position): number {
  return events.findIndex((e) => e.measure === at.measure && e.tick === at.tick);
}

/** Indexes of all notes tied together with the one at index i (in order). */
export function tieChain(events: Located[], i: number): number[] {
  let first = i;
  while (first > 0) {
    const prev = events[first - 1].event;
    if (prev.kind !== 'note' || !prev.tieToNext) break;
    first--;
  }
  const chain = [first];
  while (true) {
    const current = events[chain[chain.length - 1]].event;
    if (current.kind !== 'note' || !current.tieToNext || chain[chain.length - 1] + 1 >= events.length) break;
    chain.push(chain[chain.length - 1] + 1);
  }
  return chain;
}

/** The event that starts at this position (note or rest), or null. */
export function eventAtPosition(score: Score, at: Position): ScoreEvent | null {
  const staff = allStaves(score)[at.staff];
  if (!staff) return null;
  const events = staffEvents(staff);
  const i = indexAt(events, at);
  return i < 0 ? null : events[i].event;
}

/**
 * Where the cursor goes after the event at `at`: the start of the next event; after a
 * note, behind all notes tied to it. At the end of the piece it stays where it is.
 */
export function nextPosition(score: Score, at: Position): Position {
  const staff = allStaves(score)[at.staff];
  if (!staff) return at;
  const events = staffEvents(staff);
  const i = indexAt(events, at);
  if (i < 0) return at;
  const chain = events[i].event.kind === 'note' ? tieChain(events, i) : [i];
  const next = events[chain[chain.length - 1] + 1];
  return next ? { staff: at.staff, measure: next.measure, tick: next.tick } : at;
}

/** The start of the event that the tick lies in (for a tap anywhere in a measure). */
export function positionAtTick(score: Score, staff: number, measure: number, tick: number): Position | null {
  const events = allStaves(score)[staff]?.measures[measure];
  if (!events) return null;
  let start = 0;
  for (const event of events) {
    const end = start + eventTicks(event);
    if (tick < end) return { staff, measure, tick: start };
    start = end;
  }
  return events.length > 0 ? { staff, measure, tick: start - eventTicks(events[events.length - 1]) } : null;
}
