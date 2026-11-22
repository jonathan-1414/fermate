import { strFromU8 } from 'fflate';
import { parseScore } from '../model/validate';
import type { Score } from '../model/types';
import type { ModuleConfig } from '../modules/types';
import { baseFileName } from './filename';
import { fermateBytes } from './handIn';

/**
 * Saving the score as a Fermate file on the device and opening it again.
 * The file is the same as the one handed in: the score as JSON.
 */

/** The saved file: same name scheme as for handing in, e.g. 7a_Mia-Ben_2026-11-22.fermate. */
export function fermateFile(score: Score, date: Date): File {
  return new File([fermateBytes(score) as BlobPart], `${baseFileName(score.meta, date)}.fermate`, {
    type: 'application/json',
  });
}

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
