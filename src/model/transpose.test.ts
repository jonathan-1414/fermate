import { describe as group, expect, it } from 'vitest';
import { voll } from '../modules/voll';
import { ok, p } from '../test/helpers';
import { plain } from './duration';
import { partNames } from './instruments';
import { writeNoteAt } from './overwrite';
import { pitchToMidi } from './pitch';
import { createConfiguredScore } from './setup';
import { setTransposed, staffKeys, toSounding, toWritten, writtenView } from './transpose';
import type { Part, Pitch, Score } from './types';
import { parseScore } from './validate';

const name = (x: Pitch) => `${x.step}${x.alter === 1 ? '#' : x.alter === -1 ? 'b' : ''}${x.octave}`;
const part = (instrument: string, transposed = true) => ({ instrument, transposed }) as Part;

function score(instruments: string[], keySignature = 0): Score {
  return ok(createConfiguredScore(voll, { instruments, timeSignature: '4/4', keySignature, pickup: 0, tempo: 90 }));
}

group('sounding → written', () => {
  it('clarinet and trumpet in B: a major second higher', () => {
    expect(name(toWritten(p('C4'), part('clarinet'), 0))).toBe('D4');
    expect(name(toWritten(p('Bb3'), part('trumpet'), -2))).toBe('C4');
    expect(name(toWritten(p('F#4'), part('clarinet'), 1))).toBe('G#4');
  });

  it('saxophone in Es: a major sixth higher; horn in F: a fifth; double bass: an octave', () => {
    expect(name(toWritten(p('Eb4'), part('saxophone'), -3))).toBe('C5');
    expect(name(toWritten(p('F3'), part('horn'), 0))).toBe('C4');
    expect(name(toWritten(p('E2'), part('contrabass'), 0))).toBe('E3');
  });

  it('shown sounding: nothing changes', () => {
    expect(name(toWritten(p('C4'), part('clarinet', false), 0))).toBe('C4');
    expect(name(toWritten(p('C4'), part('flute'), 0))).toBe('C4');
  });

  it('more than six accidentals: the spelling with fewer (D flat instead of C sharp major)', () => {
    // Saxophone, sounding E major (4 sharps) → written D flat major (5 flats), not C sharp major.
    expect(name(toWritten(p('E4'), part('saxophone'), 4))).toBe('Db5');
    expect(name(toWritten(p('G#4'), part('saxophone'), 4))).toBe('F5');
  });

  it('never a double sharp: the neighbouring note with the same sound', () => {
    expect(name(toWritten(p('E#4'), part('clarinet'), 0))).toBe('G4'); // f## → g
  });
});

group('written → sounding', () => {
  it('back again', () => {
    for (const text of ['C4', 'F#4', 'Bb3', 'G5']) {
      for (const id of ['clarinet', 'saxophone', 'horn', 'contrabass']) {
        for (const key of [-4, -1, 0, 2, 4]) {
          const back = toSounding(toWritten(p(text), part(id), key), part(id), key);
          expect(pitchToMidi(back)).toBe(pitchToMidi(p(text))); // always the same sound
          // The same spelling, except for notes outside the key where the written key was
          // respelled (saxophone in E major is written in D flat major): c may come back as his.
          if (!(id === 'saxophone' && key === 4)) expect(name(back)).toBe(text);
        }
      }
    }
  });

  it('no double flat: fes on the B clarinet sounds as d (chosen 23.11.2026)', () => {
    expect(name(toSounding(p('Fb4'), part('clarinet'), 0))).toBe('D4');
  });
});

group('key and view', () => {
  it('the key moves along on a transposed staff only', () => {
    const s = ok(setTransposed(score(['clarinet', 'piano', 'violin']), 0, true));
    expect(staffKeys(s)).toEqual([2, 0, 0, 0]); // clarinet D major, piano (2 staves), violin
    expect(staffKeys(ok(setTransposed(score(['saxophone'], 4), 0, true)))).toEqual([-5]);
    expect(staffKeys(ok(setTransposed(score(['horn'], 4), 0, true)))).toEqual([5]); // B major
  });

  it('the view shows written pitches, the score stays sounding', () => {
    const s = ok(writeNoteAt(ok(setTransposed(score(['clarinet']), 0, true)), voll, { staff: 0, measure: 0, tick: 0 }, [p('C4')], plain(48)));
    const view = writtenView(s);
    expect(view.parts[0].staves[0].measures[0][0]).toMatchObject({ pitches: [p('D4')] });
    expect(s.parts[0].staves[0].measures[0][0]).toMatchObject({ pitches: [p('C4')] });
  });

  it('short name shows the tuning; the switch only for transposing instruments', () => {
    const s = ok(setTransposed(score(['flute', 'clarinet', 'clarinet']), 2, true)); // score order: flute first
    expect(partNames(s, true)).toEqual(['Fl.', 'Klar. 1', 'Klar. 2 (B)']);
    expect(partNames(s)).toEqual(['Flöte', 'Klarinette 1', 'Klarinette 2']);
    expect(setTransposed(s, 0, true)).toEqual({ ok: false, error: 'not-allowed' });
    expect(ok(setTransposed(s, 2, false)).parts[2].transposed).toBeUndefined();
  });

  it('a saved file keeps the switch; a wrong value is rejected', () => {
    const s = ok(setTransposed(score(['horn']), 0, true));
    expect(parseScore(JSON.parse(JSON.stringify(s)), voll)?.parts[0].transposed).toBe(true);
    const flute = JSON.parse(JSON.stringify(score(['flute'])));
    flute.parts[0].transposed = true;
    expect(parseScore(flute, voll)).toBeNull();
  });
});
