import { describe, expect, it } from 'vitest';
import { soundingParts, toggleMute, toggleSolo } from './mix';

const part = (mute = false, solo = false) => ({ mute, solo });

describe('what sounds', () => {
  it('without mute and solo everything sounds', () => {
    expect(soundingParts([part(), part()])).toEqual([true, true]);
  });

  it('a muted instrument is silent', () => {
    expect(soundingParts([part(true), part()])).toEqual([false, true]);
  });

  it('with a solo only the solo instruments sound, also several', () => {
    expect(soundingParts([part(false, true), part(), part()])).toEqual([true, false, false]);
    expect(soundingParts([part(false, true), part(), part(false, true)])).toEqual([true, false, true]);
  });
});

describe('mute and solo exclude each other', () => {
  it('mute on switches solo off', () => {
    expect(toggleMute(part(false, true))).toEqual(part(true, false));
  });

  it('solo on switches mute off', () => {
    expect(toggleSolo(part(true, false))).toEqual(part(false, true));
  });

  it('switching off leaves the other one as it is', () => {
    expect(toggleMute(part(true, false))).toEqual(part(false, false));
    expect(toggleSolo(part(false, true))).toEqual(part(false, false));
  });

  it('keeps everything else of the part', () => {
    expect(toggleSolo({ name: 'Fl.', volume: 0.5, mute: true, solo: false })).toEqual({ name: 'Fl.', volume: 0.5, mute: false, solo: true });
  });
});
