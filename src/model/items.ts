import { eventTicks } from './duration';
import { fullMeasureLength, splitIntoValues } from './meter';
import type { Duration, ScoreEvent, TimeSignature } from './types';

/**
 * The full version thinks of a measure as its notes and triplet groups; everything
 * else is rest that the app writes itself. These functions turn a measure into that
 * view (items) and back into a complete row of events.
 */

export type NoteEvent = Extract<ScoreEvent, { kind: 'note' }>;

/** Triplet unit in ticks: 16 = eighth triplet (3 in a quarter), 32 = quarter triplet (3 in a half). */
export type TripletUnit = 16 | 32;

export type Item =
  | { type: 'note'; start: number; event: NoteEvent }
  /** A triplet group: three slots of the same value, each a note or a rest (null). */
  | { type: 'group'; start: number; unit: TripletUnit; slots: Array<NoteEvent | null> };

export function itemEnd(item: Item): number {
  return item.type === 'note' ? item.start + eventTicks(item.event) : item.start + 3 * item.unit;
}

export function tripletDuration(unit: TripletUnit): Duration {
  return { base: unit === 16 ? 24 : 48, dotted: false, triplet: true };
}

/**
 * Reads a measure into items. Triplet events always come as complete groups of
 * three of the same kind; null if the measure breaks this rule.
 */
export function toItems(measure: ScoreEvent[]): Item[] | null {
  const items: Item[] = [];
  let pos = 0;
  let group: Extract<Item, { type: 'group' }> | null = null;
  for (const event of measure) {
    const ticks = eventTicks(event);
    if (event.duration.triplet) {
      if (group && group.unit !== ticks) return null;
      if (!group) {
        if (ticks !== 16 && ticks !== 32) return null;
        group = { type: 'group', start: pos, unit: ticks, slots: [] };
        items.push(group);
      }
      group.slots.push(event.kind === 'note' ? event : null);
      if (group.slots.length === 3) group = null;
    } else {
      if (group) return null; // a group ended early
      if (event.kind === 'note') items.push({ type: 'note', start: pos, event });
    }
    pos += ticks;
  }
  return group ? null : items;
}

/**
 * Builds a complete measure from items: gaps become rests written by the beats
 * (see splitIntoValues), groups without any note disappear. An empty measure of
 * full length gets a single whole-measure rest.
 */
export function fromItems(items: Item[], length: number, ts: TimeSignature): ScoreEvent[] {
  const kept = items
    .filter((item) => item.type === 'note' || item.slots.some((slot) => slot !== null))
    .sort((a, b) => a.start - b.start);
  if (kept.length === 0 && length === fullMeasureLength(ts)) {
    return [{ kind: 'rest', duration: wholeMeasureDuration(length), auto: true }];
  }
  const events: ScoreEvent[] = [];
  let pos = 0;
  const rests = (from: number, to: number) => {
    for (const piece of splitIntoValues(from, to, ts)) events.push({ kind: 'rest', duration: piece.duration, auto: true });
  };
  for (const item of kept) {
    if (item.start > pos) rests(pos, item.start);
    if (item.type === 'note') {
      events.push(item.event);
    } else {
      for (const slot of item.slots) events.push(slot ?? { kind: 'rest', duration: tripletDuration(item.unit), auto: true });
    }
    pos = itemEnd(item);
  }
  if (pos < length) rests(pos, length);
  return events;
}

/** One rest for a whole measure: 4/4 whole, 3/4 and 6/8 dotted half, 2/4 half. */
function wholeMeasureDuration(length: number): Duration {
  if (length === 192) return { base: 192, dotted: false, triplet: false };
  if (length === 144) return { base: 96, dotted: true, triplet: false };
  if (length === 96) return { base: 96, dotted: false, triplet: false };
  throw new Error(`No whole-measure rest for ${length} ticks`);
}

/** The group that the tick lies in (start included), if any. */
export function groupAt(items: Item[], tick: number): Extract<Item, { type: 'group' }> | null {
  for (const item of items) if (item.type === 'group' && tick >= item.start && tick < itemEnd(item)) return item;
  return null;
}

/**
 * Clears the stretch [from, to): notes that overlap it disappear (also those that
 * only partly overlap: the rest of their time becomes rest), triplet groups that
 * overlap it disappear completely.
 */
export function clearSpan(items: Item[], from: number, to: number): Item[] {
  return items.filter((item) => itemEnd(item) <= from || item.start >= to);
}
