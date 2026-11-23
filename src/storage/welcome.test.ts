import { afterEach, describe, expect, it, vi } from 'vitest';
import { markWelcomeSeen, welcomeSeen } from './welcome';

describe('welcome page shown once', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('first not seen, then seen', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
    expect(welcomeSeen()).toBe(false);
    markWelcomeSeen();
    expect(welcomeSeen()).toBe(true);
  });

  it('without storage: shown every time, no error', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(welcomeSeen()).toBe(false);
    expect(() => markWelcomeSeen()).not.toThrow();
  });
});
