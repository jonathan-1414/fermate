import {
  Accidental,
  BarlineType,
  Beam,
  CanvasContext,
  Dot,
  Formatter,
  Fraction,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Tuplet,
  Voice,
  type RenderContext,
} from 'vexflow/bravura';
import { accidentalsForStaff, type AccidentalSign } from '../model/accidentals';
import { eventTicks } from '../model/duration';
import { isOutsideRange, partNames } from '../model/instruments';
import { toItems } from '../model/items';
import { soundingParts } from '../model/mix';
import { placeEvents } from '../model/measure';
import { fullMeasureLength, isCompound, measureLengths } from '../model/meter';
import { germanNoteName } from '../model/noteName';
import { shareAPitch, staffEvents } from '../model/sequence';
import { allStaves, partOfStaff } from '../model/staves';
import type { Part, Position, Score, ScoreEvent, Staff, TimeSignature } from '../model/types';
import type { MeasureLayout, ScoreLayout } from './layout';
import type { RenderOptions } from './renderScore';
import { breakIntoSystems, stretchFactor } from './systems';

/**
 * Draws the score of the full version: every staff one long line to the right
 * (endless view), all staves below each other with their measures aligned. A fixed
 * margin on the left shows instrument, clef and key; the measure numbers are a row of
 * their own on top, so both stay when the music is scrolled.
 * Contains no musical logic: everything (rests, ties, accidentals) comes from the model.
 */

/**
 * Drawing units → screen pixels at normal size (matches the staff size of Modul 1 on an
 * iPad). The music can be zoomed from half to double this size (pinch).
 */
export const ZOOM = 1.4;
export const MIN_ZOOM = ZOOM / 2;
export const MAX_ZOOM = ZOOM * 2;
/**
 * Height of one staff's band: room above for ledger lines, the five lines (40 units),
 * room below for ledger lines and note names. The top line lies STAVE_OFFSET below the
 * band's top (VexFlow's own room above the staff is switched off, see STAVE_OPTIONS).
 */
const ROW = 100;
/** Extra room between two instruments (the two piano staves stay closer). */
const PART_GAP = 8;
const STAVE_OFFSET = 30;
/** Extra room above the first staff when the swing mark is shown. */
const SWING_ROOM = 12;
const STAVE_OPTIONS = { spaceAboveStaffLn: 0, spaceBelowStaffLn: 0 };
const NUMBERS_HEIGHT = 18;
const MIN_MEASURE_WIDTH = 90;
const MEASURE_PADDING = 36;

const DURATION_CODES: Record<number, string> = { 192: 'w', 96: 'h', 48: 'q', 24: '8', 12: '16' };
const ACCIDENTAL_CODES: Record<AccidentalSign, string> = { sharp: '#', flat: 'b', natural: 'n' };
const KEY_NAMES: Record<number, string> = { [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E' };

/** Where one staff was drawn, for the input: its band from top to bottom and its measures. */
export interface StaffLayout extends ScoreLayout {
  index: number;
  top: number;
  bottom: number;
}

export interface FullLayout {
  staves: StaffLayout[];
  /** Total width and height of the music in drawing units. */
  width: number;
  height: number;
}

export interface FullRenderOptions extends RenderOptions {
  /** In a chord, the selected tone (only it is drawn in the accent colour). */
  selectedTone: number;
  /** All notes sounding right now during playback (in all staves). */
  playingList: Position[];
  /** Screen pixels per drawing unit. */
  zoom: number;
  /** A marking (several notes): staves and the stretch from `from` up to `to` (not incl.). */
  marked?: { firstStaff: number; lastStaff: number; from: { measure: number; tick: number }; to: { measure: number; tick: number } } | null;
}

/** Eighths are beamed per beat: per quarter, in 2/2 per half, in 6/8 three eighths together. */
function beamGroup(ts: TimeSignature): Fraction {
  if (isCompound(ts)) return new Fraction(3, 8);
  if (ts.beatValue === 2) return new Fraction(1, 2);
  return new Fraction(1, 4);
}

/** A colour from the CSS variables (VexFlow needs real colours for single note heads). */
function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

function toStaveNote(event: ScoreEvent, staff: Staff, part: Part | undefined, wholeMeasureRest: boolean): StaveNote {
  const { base, dotted } = event.duration;
  const dots = dotted ? 1 : 0;
  let note: StaveNote;
  if (event.kind === 'rest') {
    // A rest filling a whole measure is always the whole rest, centred in the measure.
    const code = wholeMeasureRest ? 'w' : DURATION_CODES[base];
    note = new StaveNote({ keys: [code === 'w' ? 'd/5' : 'b/4'], duration: code + 'r', dots: wholeMeasureRest ? 0 : dots, clef: 'treble' });
    if (wholeMeasureRest) note.setCenterAlignment(true);
  } else {
    note = new StaveNote({
      keys: event.pitches.map(({ step, octave }) => `${step.toLowerCase()}/${octave}`),
      duration: DURATION_CODES[base],
      dots,
      clef: staff.clef,
      autoStem: true,
    });
    // Notes outside the instrument's range are marked.
    event.pitches.forEach((pitch, k) => {
      if (isOutsideRange(part, pitch)) {
        note.setKeyStyle(k, { fillStyle: cssColor('--out-of-range'), strokeStyle: cssColor('--out-of-range') });
      }
    });
  }
  if (dots && !wholeMeasureRest) Dot.buildAndAttach([note], { all: true });
  return note;
}

/** Adds a CSS class to a drawn note (also to its stem, which a beam draws separately). */
function markNote(note: StaveNote, className: string): void {
  note.getSVGElement()?.classList.add(className);
  note.getStem()?.getSVGElement()?.classList.add(className);
}

const same = (a: Position | null, staff: number, measure: number, tick: number) =>
  a !== null && a.staff === staff && a.measure === measure && a.tick === tick;

/** One staff of one measure, prepared before it gets its place. */
interface PreparedStaff {
  events: ScoreEvent[];
  notes: StaveNote[];
  voice: Voice;
  beams: Beam[];
  tuplets: Tuplet[];
}

function prepareStaff(
  measure: ScoreEvent[],
  staff: Staff,
  part: Part | undefined,
  ts: TimeSignature,
  signs: Array<Array<AccidentalSign | null>>,
  selection: { tick: number; tone: number } | null,
): PreparedStaff {
  const full = fullMeasureLength(ts);
  const onlyRest = measure.length === 1 && measure[0].kind === 'rest' && eventTicks(measure[0]) === full;
  const notes = measure.map((event) => toStaveNote(event, staff, part, onlyRest));
  const starts = placeEvents(measure).map((p) => p.start);
  measure.forEach((event, i) => {
    (signs[i] ?? []).forEach((sign, k) => {
      if (event.kind === 'note' && sign) notes[i].addModifier(new Accidental(ACCIDENTAL_CODES[sign]), k);
    });
    // In a chord only the selected tone is drawn in the accent colour.
    if (selection && starts[i] === selection.tick && event.kind === 'note' && event.pitches.length > 1) {
      const accent = cssColor('--accent');
      notes[i].setKeyStyle(selection.tone, { fillStyle: accent, strokeStyle: accent });
    }
  });
  // Triplet groups: three of the same kind, with a "3" (and a bracket where not beamed).
  const tuplets: Tuplet[] = [];
  for (const item of toItems(measure) ?? []) {
    if (item.type !== 'group') continue;
    const index = starts.indexOf(item.start);
    tuplets.push(new Tuplet(notes.slice(index, index + 3), { numNotes: 3, notesOccupied: 2 }));
  }
  const voice = new Voice({ numBeats: ts.beats, beatValue: ts.beatValue }).setMode(Voice.Mode.SOFT).addTickables(notes);
  const beams = Beam.generateBeams(notes, { groups: [beamGroup(ts)] });
  return { events: measure, notes, voice, beams, tuplets };
}

/**
 * The width each measure needs: room for its notes, at least a minimum. A pickup and the
 * shortened last measure get a smaller minimum, in proportion to their length, so that a
 * one-beat pickup does not stand in a measure as wide as a full one.
 */
function naturalWidths(score: Score, formatters: Array<{ minWidth: number }>): number[] {
  const full = fullMeasureLength(score.timeSignature);
  const lengths = measureLengths(score.timeSignature, score.pickup, formatters.length);
  return formatters.map((f, i) => Math.max((MIN_MEASURE_WIDTH * lengths[i]) / full, f.minWidth + MEASURE_PADDING));
}

/** Top of each staff's band (drawing units), with extra room between instruments. */
function staffTops(score: Score): number[] {
  const tops: number[] = [];
  // With swing, a little room above the first staff for the swing mark.
  let y = score.swing && !isCompound(score.timeSignature) ? SWING_ROOM : 0;
  allStaves(score).forEach((_, i) => {
    if (i > 0 && partOfStaff(score, i) !== partOfStaff(score, i - 1)) y += PART_GAP;
    tops.push(y);
    y += ROW;
  });
  return tops;
}

/** The SVG gets a fixed size in screen pixels (`zoom` per drawing unit), not the screen width. */
function newDrawing(container: HTMLDivElement, width: number, height: number, zoom: number): RenderContext {
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const svg = container.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(Math.round(width * zoom)));
    svg.setAttribute('height', String(Math.round(height * zoom)));
    svg.style.width = '';
    svg.style.height = '';
  }
  return renderer.getContext();
}

/** The fixed margin: short names, clefs and keys, a brace for the piano, the line on the left. */
function drawMargin(container: HTMLDivElement, score: Score, tops: number[], height: number, zoom: number): number {
  const staves = allStaves(score);
  const key = KEY_NAMES[score.keySignature] ?? 'C';
  const nameWidth = 58;
  const probe = new Stave(nameWidth, 0, 200).addClef('treble').addKeySignature(key);
  const width = probe.getNoteStartX() + 6;
  const ctx = newDrawing(container, width, height, zoom);
  const drawn = staves.map((staff, i) => {
    const stave = new Stave(nameWidth, tops[i] + STAVE_OFFSET, width - nameWidth, STAVE_OPTIONS).addClef(staff.clef).addKeySignature(key);
    stave.setEndBarType(BarlineType.NONE);
    stave.setContext(ctx).draw();
    return stave;
  });
  if (drawn.length > 1) new StaveConnector(drawn[0], drawn[drawn.length - 1]).setType('singleLeft').setContext(ctx).draw();
  const names = partNames(score, true);
  let first = 0;
  const sounding = soundingParts(score.parts);
  score.parts.forEach((part, p) => {
    const own = drawn.slice(first, first + part.staves.length);
    if (own.length > 1) new StaveConnector(own[0], own[own.length - 1]).setType('brace').setContext(ctx).draw();
    // The name in the middle of the instrument's staves.
    const middle = (own[0].getYForLine(2) + own[own.length - 1].getYForLine(2)) / 2;
    // Grey: the instrument does not sound right now (mixer); solo in the accent colour.
    ctx.openGroup(`instrument-name${sounding[p] ? '' : ' muted'}${part.solo ? ' solo' : ''}`);
    ctx.setFont('sans-serif', 13);
    ctx.fillText(names[p], 2, middle + 4);
    ctx.closeGroup();
    first += part.staves.length;
  });
  return width;
}

/** Draws the full version's score on the screen and returns where things were drawn. */
export function renderFullScore(container: HTMLElement, score: Score, options: FullRenderOptions): FullLayout {
  container.innerHTML = '';
  container.classList.add('full-score');
  const staves = allStaves(score);
  const parts = staves.map((_, i) => partOfStaff(score, i));
  const tops = staffTops(score);
  const height = tops[tops.length - 1] + ROW;
  const ts = score.timeSignature;

  // Prepare every measure of every staff, then give each measure the width its widest staff needs.
  const signs = staves.map((staff) => accidentalsForStaff(staff, score.keySignature));
  const count = staves[0].measures.length;
  const selectionIn = (s: number, m: number) =>
    options.selection && options.selection.staff === s && options.selection.measure === m
      ? { tick: options.selection.tick, tone: options.selectedTone }
      : null;
  const prepared = Array.from({ length: count }, (_, m) =>
    staves.map((staff, s) => prepareStaff(staff.measures[m], staff, parts[s], ts, signs[s][m], selectionIn(s, m))),
  );
  const formatters = prepared.map((column) => {
    const formatter = new Formatter();
    column.forEach((p) => formatter.joinVoices([p.voice]));
    return { formatter, minWidth: formatter.preCalculateMinTotalWidth(column.map((p) => p.voice)) };
  });
  const timeSignature = `${ts.beats}/${ts.beatValue}`;
  const timeWidth = new Stave(0, 0, 200).addTimeSignature(timeSignature).getNoteStartX() - new Stave(0, 0, 200).getNoteStartX();
  const widths = naturalWidths(score, formatters).map((w, i) => w + (i === 0 ? timeWidth : 0));
  const total = widths.reduce((sum, w) => sum + w, 0) + 12;

  // Measure numbers on top; below them margin and music side by side.
  const numbersRow = document.createElement('div');
  numbersRow.className = 'score-numbers-row';
  const numbersSpacer = document.createElement('div');
  numbersSpacer.className = 'score-numbers-spacer';
  const numbersScroller = document.createElement('div');
  numbersScroller.className = 'score-numbers';
  const numbersDrawing = document.createElement('div');
  numbersScroller.append(numbersDrawing);
  numbersRow.append(numbersSpacer, numbersScroller);
  const body = document.createElement('div');
  body.className = 'score-body';
  const margin = document.createElement('div');
  margin.className = 'score-margin';
  const scroller = document.createElement('div');
  scroller.className = 'score-scroller';
  const drawing = document.createElement('div');
  scroller.append(drawing);
  body.append(scroller, margin); // the music first: the input reads the first SVG
  container.append(body, numbersRow);

  const marginWidth = drawMargin(margin, score, tops, height, options.zoom);
  numbersSpacer.style.width = `${Math.round(marginWidth * options.zoom)}px`;
  const numbersCtx = newDrawing(numbersDrawing, total, NUMBERS_HEIGHT, options.zoom);
  const ctx = newDrawing(drawing, total, height, options.zoom);
  drawing.querySelector('svg')?.classList.add('music');

  const layout: FullLayout = {
    staves: staves.map((_, s) => ({ index: s, top: tops[s], bottom: tops[s] + ROW, topLineY: 0, lineSpacing: 10, measures: [] })),
    width: total,
    height,
  };
  let x = 0;
  prepared.forEach((column, m) => {
    const width = widths[m];
    const drawnStaves = column.map((p, s) => {
      const stave = new Stave(x, tops[s] + STAVE_OFFSET, width, STAVE_OPTIONS);
      if (m === 0) stave.setBegBarType(BarlineType.NONE).addTimeSignature(timeSignature);
      if (m === count - 1) stave.setEndBarType(BarlineType.END);
      stave.setContext(ctx).draw();
      p.notes.forEach((note) => note.setStave(stave));
      return stave;
    });
    // The bar lines of a piano go through both staves.
    let first = 0;
    for (const part of score.parts) {
      if (part.staves.length > 1) {
        const type = m === count - 1 ? 'boldDoubleRight' : 'singleRight';
        new StaveConnector(drawnStaves[first], drawnStaves[first + part.staves.length - 1]).setType(type).setContext(ctx).draw();
      }
      first += part.staves.length;
    }
    drawMeasureNumber(numbersCtx, score, m, x);
    if (m === 0) drawSwingMark(ctx, score, x + 4, tops[0] + STAVE_OFFSET - 7);
    formatters[m].formatter.formatToStave(
      column.map((p) => p.voice),
      drawnStaves[0],
    );

    column.forEach((p, s) => {
      const stave = drawnStaves[s];
      p.voice.draw(ctx, stave);
      p.beams.forEach((beam) => beam.setContext(ctx).draw());
      p.tuplets.forEach((tuplet) => tuplet.setContext(ctx).draw());
      const staffLayout = layout.staves[s];
      staffLayout.topLineY = stave.getYForLine(0);
      staffLayout.lineSpacing = stave.getSpacingBetweenLines();
      const placed = placeEvents(p.events);
      const measureLayout: MeasureLayout = {
        x,
        width,
        events: placed.map(({ start, event }, j) => ({
          tick: start,
          kind: event.kind,
          headLeft: p.notes[j].getNoteHeadBeginX(),
          headRight: p.notes[j].getNoteHeadEndX(),
          y: p.notes[j].getYs()[0],
          ys: p.notes[j].getYs(),
        })),
      };
      staffLayout.measures.push(measureLayout);

      placed.forEach(({ start, event }, j) => {
        const note = p.notes[j];
        if (same(options.preview, s, m, start)) markNote(note, 'preview');
        if (options.playingList.some((at) => same(at, s, m, start))) markNote(note, 'playing');
        // A single note or rest is selected completely (a chord: see prepareStaff).
        if (same(options.selection, s, m, start) && !(event.kind === 'note' && event.pitches.length > 1)) {
          markNote(note, 'selected');
        }
      });

      // Cursor line where no event starts at the cursor.
      if (options.cursor && options.cursor.staff === s && options.cursor.measure === m) {
        const top = stave.getYForLine(0);
        const bottom = stave.getYForLine(stave.getNumLines() - 1);
        const target = measureLayout.events.find((e) => e.tick === options.cursor!.tick);
        const cursorX = target ? target.headLeft - 6 : x + width - 6;
        ctx.openGroup('cursor');
        ctx.beginPath();
        ctx.rect(cursorX - 1.5, top - 14, 3, bottom - top + 28);
        ctx.fill();
        ctx.closeGroup();
      }
    });
    x += width;
  });

  staves.forEach((staff, s) => {
    const notesOf = prepared.map((column) => column[s]);
    drawTies(ctx, staff, notesOf);
    if (options.showNoteNames) {
      drawNoteNames(ctx, staff, notesOf, layout.staves[s].topLineY + 4 * layout.staves[s].lineSpacing);
    }
  });
  if (options.marked) drawMarking(drawing.querySelector('svg'), layout, options.marked);
  return layout;
}

/**
 * Changes the size of the drawn music at once, without drawing it again (while pinching):
 * every SVG keeps its drawing (viewBox) and only gets a new size on the screen.
 */
export function setDrawingZoom(container: HTMLElement, zoom: number): void {
  for (const svg of container.querySelectorAll('svg')) {
    const box = svg.viewBox.baseVal;
    svg.setAttribute('width', String(Math.round(box.width * zoom)));
    svg.setAttribute('height', String(Math.round(box.height * zoom)));
  }
  const spacer = container.querySelector<HTMLElement>('.score-numbers-spacer');
  const margin = container.querySelector<SVGSVGElement>('.score-margin svg');
  if (spacer && margin) spacer.style.width = `${Math.round(margin.viewBox.baseVal.width * zoom)}px`;
}

/**
 * The marking: a soft orange area behind the marked notes of each marked staff, from the
 * first marked note up to the first note after the marking (or the end of the measure).
 * Put first into the drawing so that it lies behind everything.
 */
function drawMarking(svg: SVGSVGElement | null, layout: FullLayout, marked: NonNullable<FullRenderOptions['marked']>): void {
  if (!svg) return;
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  area.setAttribute('class', 'marking');
  for (let s = marked.firstStaff; s <= marked.lastStaff; s++) {
    const band = layout.staves[s];
    if (!band) continue;
    const top = band.topLineY - 14;
    const height = 4 * band.lineSpacing + 28;
    // A marking up to a bar line ends with the measure before it.
    const last = marked.to.tick === 0 && marked.to.measure > marked.from.measure ? marked.to.measure - 1 : marked.to.measure;
    for (let m = marked.from.measure; m <= last; m++) {
      const box = band.measures[m];
      if (!box) continue;
      // At the start of a measure the area begins at the bar line (a whole-measure rest is
      // drawn in the middle of the measure).
      const xAt = (tick: number) => {
        if (tick === 0) return box.x + 2;
        const event = box.events.find((e) => e.tick >= tick);
        return event ? event.headLeft - 6 : box.x + box.width;
      };
      const left = m === marked.from.measure ? xAt(marked.from.tick) : box.x;
      const right = m === marked.to.measure ? xAt(marked.to.tick) : box.x + box.width;
      if (right <= left) continue;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(left));
      rect.setAttribute('y', String(top));
      rect.setAttribute('width', String(right - left));
      rect.setAttribute('height', String(height));
      rect.setAttribute('rx', '4');
      area.append(rect);
    }
  }
  svg.insertBefore(area, svg.firstChild);
}

/**
 * The swing mark above the first staff at the start: two eighths = triplet quarter and
 * triplet eighth (♫ = ♩³♪). Only when swing is on (never in 6/8). `y` is the baseline.
 */
function drawSwingMark(ctx: RenderContext, score: Score, x: number, y: number): void {
  if (!score.swing || isCompound(score.timeSignature)) return;
  ctx.openGroup('swing-mark');
  // Each piece is placed after the one before it (widths as drawn in its font).
  let at = x;
  const put = (text: string, font: string, size: number, dy = 0, gap = 4): number => {
    ctx.setFont(font, size);
    const left = at;
    ctx.fillText(text, at, y + dy);
    at += ctx.measureText(text).width + gap;
    return left;
  };
  put('\uE1F0\uE1F7\uE1F2', 'Bravura', 15); // two beamed eighths
  put('=', 'sans-serif', 11, -3);
  const quarter = put('\uE1D5', 'Bravura', 15, 0, 2);
  put('\uE1D7', 'Bravura', 15, 0, 0);
  // "3" over quarter and eighth: they are a triplet.
  ctx.setFont('sans-serif', 9);
  ctx.fillText('3', (quarter + at) / 2 - 3, y - 18);
  ctx.closeGroup();
}

/**
 * Measure numbers above every measure. With a pickup, the pickup measure has no number
 * and the first full measure is 1.
 */
function drawMeasureNumber(ctx: RenderContext, score: Score, index: number, x: number): void {
  const number = score.pickup > 0 ? index : index + 1;
  if (number < 1) return;
  ctx.openGroup('measure-number');
  ctx.setFont('sans-serif', 11);
  ctx.fillText(String(number), x + 3, NUMBERS_HEIGHT - 4);
  ctx.closeGroup();
}

/** For each event of a staff (in order), its drawn note. */
function drawnNotes(staff: Staff, prepared: PreparedStaff[]): StaveNote[] {
  const indexInMeasure = new Map<number, number>();
  return staffEvents(staff).map(({ measure }) => {
    const j = indexInMeasure.get(measure) ?? 0;
    indexInMeasure.set(measure, j + 1);
    return prepared[measure].notes[j];
  });
}

/** Ties between notes, also over the bar line (all measures are on one line). */
function drawTies(ctx: RenderContext, staff: Staff, prepared: PreparedStaff[]): void {
  const events = staffEvents(staff);
  const notes = drawnNotes(staff, prepared);
  events.forEach(({ event }, i) => {
    const next = events[i + 1]?.event;
    if (event.kind !== 'note' || !event.tieToNext || !next || next.kind !== 'note') return;
    const firstIndexes: number[] = [];
    const lastIndexes: number[] = [];
    event.pitches.forEach((p, a) => {
      const b = next.pitches.findIndex((q) => q.step === p.step && q.alter === p.alter && q.octave === p.octave);
      if (b >= 0) {
        firstIndexes.push(a);
        lastIndexes.push(b);
      }
    });
    if (firstIndexes.length === 0) return;
    new StaveTie({ firstNote: notes[i], lastNote: notes[i + 1], firstIndexes, lastIndexes }).setContext(ctx).draw();
  });
}

/**
 * German note names below the staff; in a chord below each other, the lowest at the
 * bottom. A note tied over from before gets none.
 */
function drawNoteNames(ctx: RenderContext, staff: Staff, prepared: PreparedStaff[], bottomLineY: number): void {
  const events = staffEvents(staff);
  const notes = drawnNotes(staff, prepared);
  ctx.openGroup('note-names');
  ctx.setFont('sans-serif', 13);
  events.forEach(({ event }, i) => {
    if (event.kind !== 'note') return;
    const prev = events[i - 1]?.event;
    if (prev?.kind === 'note' && prev.tieToNext && shareAPitch(prev, event)) return;
    const center = (notes[i].getNoteHeadBeginX() + notes[i].getNoteHeadEndX()) / 2;
    const names = [...event.pitches].reverse().map(germanNoteName);
    names.forEach((name, k) => ctx.fillText(name, center, bottomLineY + 26 + k * 14));
  });
  ctx.closeGroup();
}

/** Room above the first staff of a printed line for the measure number. */
const PRINT_NUMBER_ROOM = 14;

/**
 * Draws the score for the PDF: the measures in lines (systems) below each other, every line
 * with short names, clefs and key, the measure number at the start of the line. No cursor,
 * selection or note names. Returns one canvas per line, `width` drawing units wide and
 * `scale` times larger.
 */
export function renderFullSystemsToCanvases(score: Score, width: number, scale: number): HTMLCanvasElement[] {
  const staves = allStaves(score);
  const parts = staves.map((_, i) => partOfStaff(score, i));
  const tops = staffTops(score).map((t) => t + PRINT_NUMBER_ROOM);
  const height = tops[tops.length - 1] + ROW;
  const ts = score.timeSignature;
  const signs = staves.map((staff) => accidentalsForStaff(staff, score.keySignature));
  const count = staves[0].measures.length;
  const prepared = Array.from({ length: count }, (_, m) =>
    staves.map((staff, s) => prepareStaff(staff.measures[m], staff, parts[s], ts, signs[s][m], null)),
  );
  const formatters = prepared.map((column) => {
    const formatter = new Formatter();
    column.forEach((p) => formatter.joinVoices([p.voice]));
    return { formatter, minWidth: formatter.preCalculateMinTotalWidth(column.map((p) => p.voice)) };
  });
  const timeSignature = `${ts.beats}/${ts.beatValue}`;
  const timeWidth = new Stave(0, 0, 200).addTimeSignature(timeSignature).getNoteStartX() - new Stave(0, 0, 200).getNoteStartX();
  const natural = naturalWidths(score, formatters);

  const key = KEY_NAMES[score.keySignature] ?? 'C';
  const nameWidth = 58;
  const marginWidth = new Stave(nameWidth, 0, 200).addClef('treble').addKeySignature(key).getNoteStartX() + 6;
  const available = width - marginWidth - 2; // a little room for the final bar line
  const systems = breakIntoSystems(natural, available, timeWidth);
  const systemOf: number[] = [];
  systems.forEach((line, k) => line.forEach((m) => (systemOf[m] = k)));
  const names = partNames(score, true);

  const contexts = systems.map((line, k) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context2d = canvas.getContext('2d')!;
    context2d.fillStyle = '#ffffff';
    context2d.fillRect(0, 0, canvas.width, canvas.height);
    context2d.fillStyle = '#000000';
    context2d.strokeStyle = '#000000';
    context2d.scale(scale, scale);
    const ctx = new CanvasContext(context2d);

    // Margin: short names, clefs, key, brace for the piano, the line on the left.
    const marginStaves = staves.map((staff, s) => {
      const stave = new Stave(nameWidth, tops[s] + STAVE_OFFSET, marginWidth - nameWidth, STAVE_OPTIONS).addClef(staff.clef).addKeySignature(key);
      stave.setEndBarType(BarlineType.NONE);
      stave.setContext(ctx).draw();
      return stave;
    });
    if (marginStaves.length > 1) {
      new StaveConnector(marginStaves[0], marginStaves[marginStaves.length - 1]).setType('singleLeft').setContext(ctx).draw();
    }
    let first = 0;
    score.parts.forEach((part, p) => {
      const own = marginStaves.slice(first, first + part.staves.length);
      if (own.length > 1) new StaveConnector(own[0], own[own.length - 1]).setType('brace').setContext(ctx).draw();
      const middle = (own[0].getYForLine(2) + own[own.length - 1].getYForLine(2)) / 2;
      ctx.setFont('sans-serif', 13);
      ctx.fillText(names[p], 2, middle + 4);
      first += part.staves.length;
    });

    // Measure number at the start of the line (the pickup measure has none).
    const number = score.pickup > 0 ? line[0] : line[0] + 1;
    if (number >= 1) {
      ctx.setFont('sans-serif', 11);
      ctx.fillText(String(number), nameWidth, tops[0] + 4);
    }

    // The measures, stretched to the full width (a short last line is not).
    const extra = k === 0 ? timeWidth : 0;
    const sum = line.reduce((total, m) => total + natural[m], 0);
    const factor = stretchFactor(sum, available - extra, k === systems.length - 1);
    let x = marginWidth;
    line.forEach((m, j) => {
      const w = natural[m] * factor + (k === 0 && j === 0 ? extra : 0);
      const column = prepared[m];
      const drawn = column.map((p, s) => {
        const stave = new Stave(x, tops[s] + STAVE_OFFSET, w, STAVE_OPTIONS);
        if (j === 0) stave.setBegBarType(BarlineType.NONE);
        if (k === 0 && j === 0) stave.addTimeSignature(timeSignature);
        if (m === count - 1) stave.setEndBarType(BarlineType.END);
        stave.setContext(ctx).draw();
        p.notes.forEach((note) => note.setStave(stave));
        return stave;
      });
      if (k === 0 && j === 0) drawSwingMark(ctx, score, x + 4, tops[0] + STAVE_OFFSET - 7);
      let firstStaff = 0;
      for (const part of score.parts) {
        if (part.staves.length > 1) {
          const type = m === count - 1 ? 'boldDoubleRight' : 'singleRight';
          new StaveConnector(drawn[firstStaff], drawn[firstStaff + part.staves.length - 1]).setType(type).setContext(ctx).draw();
        }
        firstStaff += part.staves.length;
      }
      formatters[m].formatter.formatToStave(column.map((p) => p.voice), drawn[0]);
      column.forEach((p, s) => {
        p.voice.draw(ctx, drawn[s]);
        p.beams.forEach((beam) => beam.setContext(ctx).draw());
        p.tuplets.forEach((tuplet) => tuplet.setContext(ctx).draw());
      });
      x += w;
    });
    return { canvas, ctx };
  });

  // Ties; a tie over the end of a line is drawn in two halves.
  staves.forEach((staff, s) => {
    const notesOf = prepared.map((column) => column[s]);
    const events = staffEvents(staff);
    const notes = drawnNotes(staff, notesOf);
    events.forEach(({ event, measure }, i) => {
      const nextEntry = events[i + 1];
      const next = nextEntry?.event;
      if (event.kind !== 'note' || !event.tieToNext || !next || next.kind !== 'note') return;
      const firstIndexes: number[] = [];
      const lastIndexes: number[] = [];
      event.pitches.forEach((p, a) => {
        const b = next.pitches.findIndex((q) => q.step === p.step && q.alter === p.alter && q.octave === p.octave);
        if (b >= 0) {
          firstIndexes.push(a);
          lastIndexes.push(b);
        }
      });
      if (firstIndexes.length === 0) return;
      const here = systemOf[measure];
      const there = systemOf[nextEntry.measure];
      if (here === there) {
        new StaveTie({ firstNote: notes[i], lastNote: notes[i + 1], firstIndexes, lastIndexes }).setContext(contexts[here].ctx).draw();
      } else {
        new StaveTie({ firstNote: notes[i], lastNote: null, firstIndexes, lastIndexes }).setContext(contexts[here].ctx).draw();
        new StaveTie({ firstNote: null, lastNote: notes[i + 1], firstIndexes, lastIndexes }).setContext(contexts[there].ctx).draw();
      }
    });
  });
  return contexts.map((c) => c.canvas);
}
