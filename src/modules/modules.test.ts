import { describe, expect, it } from 'vitest';
import { moduleById, moduleFromSearch } from './index';
import { modul1 } from './modul1';
import { voll } from './voll';

describe('moduleFromSearch', () => {
  it('uses Modul 1 without a parameter', () => {
    expect(moduleFromSearch('')).toBe(modul1);
  });

  it('reads ?modul=1', () => {
    expect(moduleFromSearch('?modul=1')).toBe(modul1);
  });

  it('falls back to Modul 1 for unknown modules', () => {
    expect(moduleFromSearch('?modul=99')).toBe(modul1);
    expect(moduleFromSearch('?modul=')).toBe(modul1);
  });

  it('switches on setting rests with &pausen=ja', () => {
    expect(moduleFromSearch('?modul=1&pausen=ja')).toEqual({ ...modul1, manualRests: true });
    expect(moduleFromSearch('?pausen=ja').manualRests).toBe(true);
  });

  it('leaves rests off without pausen=ja, and does not change Modul 1 itself', () => {
    expect(moduleFromSearch('?modul=1&pausen=nein').manualRests).toBe(false);
    expect(moduleFromSearch('?modul=1').manualRests).toBe(false);
    moduleFromSearch('?pausen=ja');
    expect(modul1.manualRests).toBe(false);
  });

  it('reads ?modul=voll (the full version beta)', () => {
    expect(moduleFromSearch('?modul=voll')).toBe(voll);
    expect(moduleById('voll')).toBe(voll);
    expect(moduleById('1')).toBe(modul1);
  });
});
