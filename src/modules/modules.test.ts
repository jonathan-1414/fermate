import { describe, expect, it } from 'vitest';
import { moduleFromSearch } from './index';
import { modul1 } from './modul1';

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
});
