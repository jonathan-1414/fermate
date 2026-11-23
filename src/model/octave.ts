import type { ModuleConfig } from '../modules/types';
import type { EditResult } from './edit';
import { sortPitches } from './overwrite';
import { parsePitch, pitchToMidi } from './pitch';
import { type Range, toAbsolute } from './range';
import { cleanTies, indexAt, samePitch, staffEvents, tieChain } from './sequence';
import { allStaves } from './staves';
import type { Pitch, Position, Score } from './types';

/**
 * "Oktave ↑" and "Oktave ↓" (CLAUDE.md, section 5): move the selected note, chord, chord
 * tone or every note of a marking one octave up or down. Accidentals stay (fis stays fis),
 * notes tied to a moved note move along. Allowed up to the module's range (the piano
 * keyboard), also beyond the instrument's range (shown marked). If any tone would leave
 * the module's range, nothing changes: a melody never falls apart.
 */

type Fail = Extract<EditResult, { ok: false }>;
const fail = (error: Fail['error']): Fail => ({ ok: false, error });

const shifted = (p: Pitch, direction: 1 | -1): Pitch => ({ ...p, octave: p.octave + direction });

function inModuleRange(module: ModuleConfig, p: Pitch): boolean {
  const midi = pitchToMidi(p);
  return midi >= pitchToMidi(parsePitch(module.range.low)) && midi <= pitchToMidi(parsePitch(module.range.high));
}

/** All notes of these indexes and the notes tied to them, in order. */
function withTies(events: ReturnType<typeof staffEvents>, indexes: number[]): number[] {
  const all = new Set<number>();
  for (const i of indexes) for (const j of tieChain(events, i)) all.add(j);
  return [...all].sort((a, b) => a - b);
}

/** Moves whole notes (all their tones) on some staves; null if a tone would leave the range. */
function shiftNotes(score: Score, module: ModuleConfig, picks: Array<{ staff: number; indexes: number[] }>, direction: 1 | -1): EditResult {
  const copy = structuredClone(score);
  let moved = false;
  for (const { staff: s, indexes } of picks) {
    const staff = allStaves(copy)[s];
    const events = staffEvents(staff);
    for (const i of withTies(events, indexes)) {
      const event = events[i].event;
      if (event.kind !== 'note') continue;
      const pitches = event.pitches.map((p) => shifted(p, direction));
      if (!pitches.every((p) => inModuleRange(module, p))) return fail('out-of-range');
      event.pitches = pitches;
      moved = true;
    }
    cleanTies(staff);
  }
  return moved ? { ok: true, score: copy } : fail('no-note');
}

/**
 * The note at the cursor one octave up (+1) or down (-1). With `tone` (a chord tone
 * selected while "Akkord" is pressed) only that tone moves, and the same tone in the
 * notes tied to it; otherwise the whole note or chord.
 */
export function octaveAt(score: Score, module: ModuleConfig, at: Position, direction: 1 | -1, tone: number | null = null): EditResult {
  const staff = allStaves(score)[at.staff];
  if (!staff) return fail('invalid-position');
  const events = staffEvents(staff);
  const index = indexAt(events, at);
  const first = events[index]?.event;
  if (first?.kind !== 'note') return fail('no-note');
  if (tone === null || first.pitches.length === 1) return shiftNotes(score, module, [{ staff: at.staff, indexes: [index] }], direction);

  const old = first.pitches[tone];
  if (!old) return fail('no-note');
  const moved = shifted(old, direction);
  if (!inModuleRange(module, moved)) return fail('out-of-range');
  if (first.pitches.some((p) => samePitch(p, moved))) return fail('duplicate-tone');
  const copy = structuredClone(score);
  const copyStaff = allStaves(copy)[at.staff];
  const copyEvents = staffEvents(copyStaff);
  for (const i of tieChain(copyEvents, index)) {
    const event = copyEvents[i].event;
    if (event.kind !== 'note') continue;
    const k = event.pitches.findIndex((p) => samePitch(p, old));
    if (k < 0 || (i !== index && event.pitches.some((p) => samePitch(p, moved)))) continue;
    event.pitches = sortPitches(event.pitches.map((p, j) => (j === k ? moved : p)));
  }
  cleanTies(copyStaff);
  return { ok: true, score: copy };
}

/** Every note that starts in the marking one octave up (+1) or down (-1). */
export function octaveRange(score: Score, module: ModuleConfig, range: Range, direction: 1 | -1): EditResult {
  const picks: Array<{ staff: number; indexes: number[] }> = [];
  for (let s = range.firstStaff; s <= range.lastStaff; s++) {
    const events = staffEvents(allStaves(score)[s]);
    const indexes = events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => {
        const abs = toAbsolute(score, e.measure, e.tick);
        return e.event.kind === 'note' && abs >= range.from && abs < range.to;
      })
      .map(({ i }) => i);
    picks.push({ staff: s, indexes });
  }
  return shiftNotes(score, module, picks, direction);
}
