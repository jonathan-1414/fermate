import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../model/score';
import { modul1 } from '../modules/modul1';
import { voll } from '../modules/voll';
import { fermateFile, readFermateFile } from './fermateFile';

function score() {
  const s = createEmptyScore(voll);
  s.meta = { title: 'Mein Lied', names: ['Mia', 'Ben'], className: '7a' };
  return s;
}
const day = new Date(2026, 10, 22);
const bytesOf = async (file: File) => new Uint8Array(await file.arrayBuffer());

describe('Fermate file: save and open', () => {
  it('the saved file has the hand-in name scheme', () => {
    expect(fermateFile(score(), day).name).toBe('7a_Mia-Ben_2026-11-22.fermate');
  });

  it('a saved file opens again as the same score', async () => {
    const result = readFermateFile(await bytesOf(fermateFile(score(), day)), voll);
    expect(result).toEqual({ ok: true, score: score() });
  });

  it('a file of another module is recognised as such', async () => {
    const other = createEmptyScore(modul1);
    other.meta = score().meta;
    expect(readFermateFile(await bytesOf(fermateFile(other, day)), voll)).toEqual({ ok: false, error: 'other-module' });
  });

  it('anything else cannot be read', () => {
    expect(readFermateFile(strToU8('Hallo'), voll)).toEqual({ ok: false, error: 'unreadable' });
    expect(readFermateFile(strToU8('{"format":"fermate","version":1}'), voll)).toEqual({ ok: false, error: 'unreadable' });
    const broken = { ...score(), parts: [] };
    expect(readFermateFile(strToU8(JSON.stringify(broken)), voll)).toEqual({ ok: false, error: 'unreadable' });
  });
});
