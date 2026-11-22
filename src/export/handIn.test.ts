import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../model/score';
import { parseScore } from '../model/validate';
import { modul1 } from '../modules/modul1';
import { fermateBytes, buildHandIn, germanDate, placeSystem } from './handIn';

function score() {
  const s = createEmptyScore(modul1);
  s.meta = { title: 'Mein Lied', names: ['Mia', 'Anna Lena'], className: '7a' };
  return s;
}
const day = new Date(2026, 10, 11);

describe('hand-in files', () => {
  it('the Fermate file contains the score and can be read again', () => {
    const text = strFromU8(fermateBytes(score()));
    expect(parseScore(JSON.parse(text), modul1)).toEqual(score());
  });

  it('one format gives one file with the right name', async () => {
    const file = await buildHandIn(score(), ['fermate'], day);
    expect(file.name).toBe('7a_Mia-AnnaLena_2026-11-11.fermate');
  });

  it('the date is written the German way in the PDF', () => {
    expect(germanDate(day)).toBe('11.11.2026');
  });
});


describe('placing a line of music on the PDF page (mm, A4: bottom at 276)', () => {
  it('a line that fits stays where it is', () => {
    expect(placeSystem(180, 60, 40, 276, false)).toEqual({ newPage: false, width: 180, height: 60 });
  });

  it('a line that does not fit below others goes to a new page, in full size', () => {
    expect(placeSystem(180, 60, 250, 276, true)).toEqual({ newPage: true, width: 180, height: 60 });
  });

  it('the first line below the heading is made smaller instead of leaving page 1 without music', () => {
    const fit = placeSystem(180, 250, 46, 276, false);
    expect(fit.newPage).toBe(false);
    expect(fit.height).toBeCloseTo(230);
    expect(fit.width).toBeCloseTo(180 * (230 / 250));
  });

  it('a line higher than a whole page is made smaller on its new page', () => {
    const fit = placeSystem(180, 300, 100, 276, true);
    expect(fit.newPage).toBe(true);
    expect(fit.height).toBeCloseTo(276 - 15);
  });
});
