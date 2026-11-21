import {
  Accidental,
  BarlineType,
  Beam,
  Dot,
  Formatter,
  Fraction,
  Renderer,
  Stave,
  StaveNote,
  StaveTie,
  Tuplet,
  Voice,
  type RenderContext,
} from 'vexflow/bravura';
import { accidentalsForStaff, type AccidentalSign } from '../model/accidentals';
import { eventTicks } from '../model/duration';
import { toItems } from '../model/items';
import { placeEvents } from '../model/measure';
import { fullMeasureLength, isCompound } from '../model/meter';
import { germanNoteName } from '../model/noteName';
import { shareAPitch, staffEvents } from '../model/sequence';
import { allStaves, partOfStaff } from '../model/staves';
import type { Position, Score, ScoreEvent, Staff, TimeSignature } from '../model/types';
import type { MeasureLayout, ScoreLayout } from './layout';
import type { RenderOptions } from './renderScore';

/**
 * Draws the score of the full version: one long staff to the right (endless view),
 * with a fixed margin on the left that shows the instrument, clef and key.
 * Contains no musical logic: everything (rests, ties, accidentals) comes from the model.
 */

const HEIGHT = 180;
const STAVE_Y = 50;
const NAME_Y = 168;
/** Drawing units → screen pixels. Matches the staff size of Modul 1 on an iPad. */
export const ZOOM = 1.4;
const MIN_MEASURE_WIDTH = 90;
const MEASURE_PADDING = 36;

const DURATION_CODES: Record<number, string> = { 192: 'w', 96: 'h', 48: 'q', 24: '8', 12: '16' };
const ACCIDENTAL_CODES: Record<AccidentalSign, string> = { sharp: '#', flat: 'b', natural: 'n' };
const KEY_NAMES: Record<number, string> = { [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E' };
/** Short names in the margin; the table of all instruments comes in a later step. */
const SHORT_NAMES: Record<string, string> = { piano: 'Klav.' };

/** Eighths are beamed per beat: per quarter, in 2/2 per half, in 6/8 three eighths together. */
function beamGroup(ts: TimeSignature): Fraction {
  if (isCompound(ts)) return new Fraction(3, 8);
  if (ts.beatValue === 2) return new Fraction(1, 2);
  return new Fraction(1, 4);
}

function toStaveNote(event: ScoreEvent, staff: Staff, wholeMeasureRest: boolean): StaveNote {
  const { base, dotted } = event.duration;
  const dots = dotted ? 1 : 0;
  let note: StaveNote;
  if (event.kind === 'rest') {
    // A rest filling a whole measure is always the whole rest, centred in the measure.
    const code = wholeMeasureRest ? 'w' : DURATION_CODES[base];
    note = new StaveNote({ keys: [code === 'w' ? 'd/5' : 'b/4'], duration: code + 'r', dots: wholeMeasureRest ? 0 : dots, clef: staff.clef });
    if (wholeMeasureRest) note.setCenterAlignment(true);
  } else {
    note = new StaveNote({
      keys: event.pitches.map(({ step, octave }) => `${step.toLowerCase()}/${octave}`),
      duration: DURATION_CODES[base],
      dots,
      clef: staff.clef,
      autoStem: true,
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

/** Everything prepared for one measure before it gets its place. */
interface PreparedMeasure {
  events: ScoreEvent[];
  notes: StaveNote[];
  voice: Voice;
  beams: Beam[];
  tuplets: Tuplet[];
  formatter: Formatter;
  minWidth: number;
}

function prepareMeasure(measure: ScoreEvent[], staff: Staff, ts: TimeSignature, signs: Array<Array<AccidentalSign | null>>): PreparedMeasure {
  const full = fullMeasureLength(ts);
  const onlyRest = measure.length === 1 && measure[0].kind === 'rest' && eventTicks(measure[0]) === full;
  const notes = measure.map((event) => toStaveNote(event, staff, onlyRest));
  measure.forEach((event, i) =>
    (signs[i] ?? []).forEach((sign, k) => {
      if (event.kind === 'note' && sign) notes[i].addModifier(new Accidental(ACCIDENTAL_CODES[sign]), k);
    }),
  );
  // Triplet groups: three of the same kind, with a "3" (and a bracket where not beamed).
  const tuplets: Tuplet[] = [];
  const starts = placeEvents(measure).map((p) => p.start);
  for (const item of toItems(measure) ?? []) {
    if (item.type !== 'group') continue;
    const index = starts.indexOf(item.start);
    tuplets.push(new Tuplet(notes.slice(index, index + 3), { numNotes: 3, notesOccupied: 2 }));
  }
  const voice = new Voice({ numBeats: ts.beats, beatValue: ts.beatValue }).setMode(Voice.Mode.SOFT).addTickables(notes);
  const beams = Beam.generateBeams(notes, { groups: [beamGroup(ts)] });
  const formatter = new Formatter().joinVoices([voice]);
  const minWidth = formatter.preCalculateMinTotalWidth([voice]);
  return { events: measure, notes, voice, beams, tuplets, formatter, minWidth };
}

/** Width of the fixed margin: instrument name, clef and key signature. */
function drawMargin(container: HTMLDivElement, score: Score, staff: Staff): void {
  const name = SHORT_NAMES[partOfStaff(score, 0)?.instrument ?? ''] ?? '';
  const nameWidth = name ? 44 : 8;
  const probe = new Stave(nameWidth, STAVE_Y, 200).addClef(staff.clef).addKeySignature(KEY_NAMES[score.keySignature] ?? 'C');
  const width = probe.getNoteStartX() + 6;

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, HEIGHT);
  const ctx = renderer.getContext();
  scaleSvg(container, width);
  const stave = new Stave(nameWidth, STAVE_Y, width - nameWidth)
    .addClef(staff.clef)
    .addKeySignature(KEY_NAMES[score.keySignature] ?? 'C');
  stave.setEndBarType(BarlineType.NONE);
  stave.setContext(ctx).draw();
  if (name) {
    ctx.openGroup('instrument-name');
    ctx.setFont('sans-serif', 13);
    ctx.fillText(name, 2, stave.getYForLine(2) + 4);
    ctx.closeGroup();
  }
}

/** The SVG gets a fixed size in screen pixels (ZOOM per drawing unit), not the screen width. */
function scaleSvg(container: HTMLDivElement, width: number): SVGSVGElement | null {
  const svg = container.querySelector('svg');
  if (!svg) return null;
  svg.setAttribute('viewBox', `0 0 ${width} ${HEIGHT}`);
  svg.setAttribute('width', String(Math.round(width * ZOOM)));
  svg.setAttribute('height', String(Math.round(HEIGHT * ZOOM)));
  svg.style.width = '';
  svg.style.height = '';
  return svg;
}

/** Draws the full version's score on the screen and returns where things were drawn. */
export function renderFullScore(container: HTMLElement, score: Score, options: RenderOptions): ScoreLayout {
  container.innerHTML = '';
  container.classList.add('full-score');
  const margin = document.createElement('div');
  margin.className = 'score-margin';
  const scroller = document.createElement('div');
  scroller.className = 'score-scroller';
  const drawing = document.createElement('div');
  scroller.append(drawing);
  container.append(scroller, margin); // the music first: the input reads the first SVG
  margin.style.order = '-1';

  const staffIndex = 0; // more staves come with the instruments
  const staff = allStaves(score)[staffIndex];
  drawMargin(margin, score, staff);

  const ts = score.timeSignature;
  const signs = accidentalsForStaff(staff, score.keySignature);
  const prepared = staff.measures.map((measure, i) => prepareMeasure(measure, staff, ts, signs[i]));

  // Each measure as wide as its notes need; the first also holds the time signature.
  const timeSignature = `${ts.beats}/${ts.beatValue}`;
  const timeWidth = new Stave(0, 0, 200).addTimeSignature(timeSignature).getNoteStartX() - new Stave(0, 0, 200).getNoteStartX();
  const widths = prepared.map((p, i) => Math.max(MIN_MEASURE_WIDTH, p.minWidth + MEASURE_PADDING) + (i === 0 ? timeWidth : 0));
  const total = widths.reduce((sum, w) => sum + w, 0) + 12;

  const renderer = new Renderer(drawing, Renderer.Backends.SVG);
  renderer.resize(total, HEIGHT);
  const ctx = renderer.getContext();
  scaleSvg(drawing, total)?.classList.add('music');

  const layout: ScoreLayout = { topLineY: 0, lineSpacing: 10, measures: [] };
  const count = staff.measures.length;
  let x = 0;
  prepared.forEach((p, i) => {
    const width = widths[i];
    const stave = new Stave(x, STAVE_Y, width);
    if (i === 0) stave.setBegBarType(BarlineType.NONE).addTimeSignature(timeSignature);
    if (i === count - 1) stave.setEndBarType(BarlineType.END);
    stave.setContext(ctx).draw();
    layout.topLineY = stave.getYForLine(0);
    layout.lineSpacing = stave.getSpacingBetweenLines();
    drawMeasureNumber(ctx, score, i, x, stave.getYForLine(0));

    p.notes.forEach((note) => note.setStave(stave));
    p.formatter.formatToStave([p.voice], stave);
    p.voice.draw(ctx, stave);
    p.beams.forEach((beam) => beam.setContext(ctx).draw());
    p.tuplets.forEach((tuplet) => tuplet.setContext(ctx).draw());

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
      })),
    };
    layout.measures.push(measureLayout);

    placed.forEach(({ start, event }, j) => {
      if (same(options.preview, staffIndex, i, start)) markNote(p.notes[j], 'preview');
      if (event.kind === 'rest' && event.auto && !options.showRests) return;
      if (same(options.selection, staffIndex, i, start)) markNote(p.notes[j], 'selected');
      if (same(options.playing, staffIndex, i, start)) markNote(p.notes[j], 'playing');
    });

    // Cursor: a line just before the spot where the next note will go.
    if (options.cursor && options.cursor.staff === staffIndex && options.cursor.measure === i) {
      const top = stave.getYForLine(0);
      const bottom = stave.getYForLine(stave.getNumLines() - 1);
      const target = measureLayout.events.find((e) => e.tick === options.cursor!.tick);
      const onlyRest = p.events.length === 1 && p.events[0].kind === 'rest';
      const cursorX = onlyRest ? stave.getNoteStartX() + 4 : target ? target.headLeft - 6 : x + width - 6;
      ctx.openGroup('cursor');
      ctx.beginPath();
      ctx.rect(cursorX - 1.5, top - 14, 3, bottom - top + 28);
      ctx.fill();
      ctx.closeGroup();
    }
    x += width;
  });

  drawTies(ctx, staff, prepared);
  if (options.showNoteNames) drawNoteNames(ctx, staff, prepared);
  return layout;
}

/**
 * Measure numbers above every measure. With a pickup, the pickup measure has no number
 * and the first full measure is 1.
 */
function drawMeasureNumber(ctx: RenderContext, score: Score, index: number, x: number, topLineY: number): void {
  const number = score.pickup > 0 ? index : index + 1;
  if (number < 1) return;
  ctx.openGroup('measure-number');
  ctx.setFont('sans-serif', 11);
  ctx.fillText(String(number), x + 3, topLineY - 18);
  ctx.closeGroup();
}

/** Ties between notes, also over the bar line (all measures are on one line). */
function drawTies(ctx: RenderContext, staff: Staff, prepared: PreparedMeasure[]): void {
  const events = staffEvents(staff);
  const indexInMeasure = new Map<number, number>();
  const noteOf = events.map(({ measure }) => {
    const j = indexInMeasure.get(measure) ?? 0;
    indexInMeasure.set(measure, j + 1);
    return prepared[measure].notes[j];
  });
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
    new StaveTie({ firstNote: noteOf[i], lastNote: noteOf[i + 1], firstIndexes, lastIndexes }).setContext(ctx).draw();
  });
}

/** German note names below the staff; a note tied over from before gets none. */
function drawNoteNames(ctx: RenderContext, staff: Staff, prepared: PreparedMeasure[]): void {
  const events = staffEvents(staff);
  ctx.openGroup('note-names');
  ctx.setFont('sans-serif', 14);
  const indexInMeasure = new Map<number, number>();
  events.forEach(({ measure, event }, i) => {
    const j = indexInMeasure.get(measure) ?? 0;
    indexInMeasure.set(measure, j + 1);
    if (event.kind !== 'note') return;
    const prev = events[i - 1]?.event;
    if (prev?.kind === 'note' && prev.tieToNext && shareAPitch(prev, event)) return;
    const note = prepared[measure].notes[j];
    const center = (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
    ctx.fillText(germanNoteName(event.pitches[0]), center, NAME_Y);
  });
  ctx.closeGroup();
}
