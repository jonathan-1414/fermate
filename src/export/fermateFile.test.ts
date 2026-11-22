import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../model/score';
import { modul1 } from '../modules/modul1';
import { voll } from '../modules/voll';
import { readFermateFile } from './fermateFile';
import { buildHandIn } from './handIn';

function score() {
  const s = createEmptyScore(voll);
  s.meta = { title: 'Mein Lied', names: ['Mia', 'Ben'], className: '7a' };
  return s;
}
const day = new Date(2026, 10, 22);
const saved = async (s: ReturnType<typeof score>) => new Uint8Array(await (await buildHandIn(s, ['fermate'], day)).arrayBuffer());

describe('Fermate file: open', () => {
  it('a saved file opens again as the same score', async () => {
    const result = readFermateFile(await saved(score()), voll);
    expect(result).toEqual({ ok: true, score: score() });
  });

  it('a file of another module is recognised as such', async () => {
    const other = createEmptyScore(modul1);
    other.meta = score().meta;
    expect(readFermateFile(await saved(other), voll)).toEqual({ ok: false, error: 'other-module' });
  });

  it('anything else cannot be read', () => {
    expect(readFermateFile(strToU8('Hallo'), voll)).toEqual({ ok: false, error: 'unreadable' });
    expect(readFermateFile(strToU8('{"format":"fermate","version":1}'), voll)).toEqual({ ok: false, error: 'unreadable' });
    const broken = { ...score(), parts: [] };
    expect(readFermateFile(strToU8(JSON.stringify(broken)), voll)).toEqual({ ok: false, error: 'unreadable' });
  });
});
