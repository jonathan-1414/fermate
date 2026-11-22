import { strFromU8 } from 'fflate';
import { parseScore } from '../model/validate';
import type { Score } from '../model/types';
import type { ModuleConfig } from '../modules/types';

/**
 * Opening a Fermate file (saved with "Speichern und teilen"): the score as JSON.
 */

export type ReadError =
  /** Not a Fermate file, broken, or from an older version. */
  | 'unreadable'
  /** A Fermate file of another module (e.g. from Modul 1). */
  | 'other-module';

/** Reads an opened file. The content is checked completely before the app uses it. */
export function readFermateFile(bytes: Uint8Array, module: ModuleConfig): { ok: true; score: Score } | { ok: false; error: ReadError } {
  let data: unknown;
  try {
    data = JSON.parse(strFromU8(bytes));
  } catch {
    return { ok: false, error: 'unreadable' };
  }
  const score = parseScore(data, module);
  if (score) return { ok: true, score };
  const isOther =
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>).format === 'fermate' &&
    (data as Record<string, unknown>).version === 2 &&
    (data as Record<string, unknown>).moduleId !== module.id;
  return { ok: false, error: isOther ? 'other-module' : 'unreadable' };
}
