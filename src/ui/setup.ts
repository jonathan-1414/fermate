import { TRANSPOSITIONS } from '../model/transpose';
import { INSTRUMENTS, instrumentById, partNames } from '../model/instruments';
import { fullMeasureLength, isCompound, pickupUnit } from '../model/meter';
import { parseTimeSignature } from '../model/score';
import type { Score } from '../model/types';
import type { ModuleConfig } from '../modules/types';
import { el, metaFields, showDialog, textButton } from './dialogs';
import type { Meta } from '../model/meta';

/**
 * The start wizard of the full version (pages 2 and 3; page 1 is the details dialog)
 * and the settings menu (gear). See CLAUDE.md, section 5.
 */

export const KEY_NAMES: Record<number, string> = {
  [-4]: 'As-Dur / f-Moll',
  [-3]: 'Es-Dur / c-Moll',
  [-2]: 'B-Dur / g-Moll',
  [-1]: 'F-Dur / d-Moll',
  0: 'C-Dur / a-Moll',
  1: 'G-Dur / e-Moll',
  2: 'D-Dur / h-Moll',
  3: 'A-Dur / fis-Moll',
  4: 'E-Dur / cis-Moll',
};

/** Possible pickup lengths (ticks) with their names: quarters, in 6/8 eighths. */
export function pickupChoices(timeSignature: string): Array<{ ticks: number; label: string }> {
  const ts = parseTimeSignature(timeSignature);
  const unit = pickupUnit(ts);
  const name = isCompound(ts) ? 'Achtel' : 'Viertel';
  const choices = [];
  for (let ticks = unit; ticks < fullMeasureLength(ts); ticks += unit) choices.push({ ticks, label: `${ticks / unit} ${name}` });
  return choices;
}

/** The beat the tempo is counted in (music font) and its factor to quarters. */
export function tempoUnitOf(timeSignature: string): { glyph: string; factor: number } {
  const ts = parseTimeSignature(timeSignature);
  if (isCompound(ts)) return { glyph: '', factor: 1.5 };
  if (ts.beatValue === 2) return { glyph: '', factor: 2 };
  return { glyph: '', factor: 1 };
}

/** Chosen instruments in score order, with numbers where one is there more than once. */
function namesInOrder(ids: string[]): Array<{ id: string; name: string; index: number }> {
  const order = (id: string) => INSTRUMENTS.findIndex((i) => i.id === id);
  const sorted = ids.map((id, index) => ({ id, index })).sort((a, b) => order(a.id) - order(b.id) || a.index - b.index);
  return sorted.map(({ id, index }, k) => {
    const same = sorted.filter((s) => s.id === id);
    const name = instrumentById(id)?.name ?? id;
    return { id, index, name: same.length > 1 ? `${name} ${sorted.slice(0, k + 1).filter((s) => s.id === id).length}` : name };
  });
}

function select(label: string, options: Array<{ value: string; label: string }>, value: string): { field: HTMLElement; input: HTMLSelectElement } {
  const input = el('select', {});
  for (const option of options) input.append(el('option', { value: option.value, textContent: option.label }));
  input.value = value;
  const field = el('label', { className: 'field' }, el('span', { textContent: label }), input);
  return { field, input };
}

/** Page 2: the instruments (at least one, at most `max`, the piano only once). No preselection. */
export function askInstruments(chosen: string[], max: number): Promise<string[] | 'back'> {
  return new Promise((resolve) => {
    const list = [...chosen];
    const dialog = el('dialog', { className: 'dialog wide' });
    const body = el('div', {});
    const back = textButton('Zurück');
    const next = textButton('Weiter', 'tool primary');
    dialog.append(
      el('h2', { textContent: 'Instrumente' }),
      el('p', { className: 'dialog-text', textContent: `Wähle bis zu ${max} Instrumente. Das Klavier hat zwei Notenzeilen und kommt nur einmal vor.` }),
      body,
      el('div', { className: 'dialog-actions' }, back, next),
    );

    function draw(): void {
      const full = list.length >= max;
      const offer = el(
        'div',
        { className: 'instrument-choice' },
        ...INSTRUMENTS.map((instrument) => {
          const b = textButton(`+ ${instrument.name}`);
          b.disabled = full || (instrument.id === 'piano' && list.includes('piano'));
          b.addEventListener('click', () => {
            list.push(instrument.id);
            draw();
          });
          return b;
        }),
      );
      const chosenList = el(
        'ul',
        { className: 'instrument-list' },
        ...namesInOrder(list).map(({ index, name }) => {
          const remove = textButton('Entfernen');
          remove.setAttribute('aria-label', `${name} entfernen`);
          remove.addEventListener('click', () => {
            list.splice(index, 1);
            draw();
          });
          return el('li', {}, el('span', { textContent: name }), remove);
        }),
      );
      const empty = el('p', { className: 'dialog-text muted-text', textContent: 'Noch kein Instrument gewählt.' });
      body.replaceChildren(offer, el('h3', { textContent: 'Gewählt' }), list.length ? chosenList : empty);
      next.disabled = list.length === 0;
    }
    draw();

    const close = showDialog(dialog, null); // cannot be cancelled: it is part of the start
    back.addEventListener('click', () => {
      close();
      resolve('back');
    });
    next.addEventListener('click', () => {
      close();
      resolve(list);
    });
    dialog.focus();
  });
}

export interface MeterChoice {
  timeSignature: string;
  keySignature: number;
  pickup: number;
  tempo: number; // quarters per minute
}

/** Page 3: time signature, key, pickup and tempo (with the usual defaults). */
export function askMeter(module: ModuleConfig, current: MeterChoice): Promise<MeterChoice | 'back'> {
  return new Promise((resolve) => {
    const choice = { ...current };
    const dialog = el('dialog', { className: 'dialog wide' });
    const body = el('div', {});
    const back = textButton('Zurück');
    const go = textButton('Los geht’s', 'tool primary');
    dialog.append(el('h2', { textContent: 'Takt und Tonart' }), body, el('div', { className: 'dialog-actions' }, back, go));

    function draw(): void {
      const meters = el(
        'div',
        { className: 'segmented', role: 'radiogroup' },
        ...module.timeSignatures.map((text) => {
          const b = textButton(text);
          b.setAttribute('aria-pressed', String(text === choice.timeSignature));
          b.addEventListener('click', () => {
            const unit = tempoUnitOf(choice.timeSignature);
            const beats = Math.round(choice.tempo / unit.factor);
            choice.timeSignature = text;
            choice.tempo = beats * tempoUnitOf(text).factor; // the beats per minute stay
            if (!pickupChoices(text).some((c) => c.ticks === choice.pickup)) choice.pickup = 0;
            draw();
          });
          return b;
        }),
      );
      const key = select(
        'Tonart',
        module.keySignatures.map((k) => ({ value: String(k), label: KEY_NAMES[k] ?? String(k) })),
        String(choice.keySignature),
      );
      key.input.addEventListener('change', () => (choice.keySignature = Number(key.input.value)));
      const pickup = pickupField(choice.timeSignature, choice.pickup, (ticks) => (choice.pickup = ticks));
      const unit = tempoUnitOf(choice.timeSignature);
      const tempoValue = el('span', { className: 'tempo-value' });
      const slider = el('input', { type: 'range', min: '40', max: '200', className: 'tempo-slider' });
      slider.value = String(Math.round(choice.tempo / unit.factor));
      slider.setAttribute('aria-label', 'Tempo (Schläge pro Minute)');
      const showTempo = () => (tempoValue.textContent = `= ${slider.value}`);
      slider.addEventListener('input', () => {
        choice.tempo = Number(slider.value) * unit.factor;
        showTempo();
      });
      showTempo();
      const glyph = el('span', { className: 'glyph music', textContent: unit.glyph });
      body.replaceChildren(
        el('div', { className: 'field' }, el('span', { textContent: 'Taktart' }), meters),
        key.field,
        // Tempo matters for everyone, a pickup not always: the pickup comes last (23.11.2026).
        el('div', { className: 'field' }, el('span', { textContent: 'Tempo' }), el('p', { className: 'tempo-line' }, glyph, tempoValue), slider),
        pickup,
      );
    }
    draw();

    const close = showDialog(dialog, null);
    back.addEventListener('click', () => {
      close();
      resolve('back');
    });
    go.addEventListener('click', () => {
      close();
      resolve(choice);
    });
    dialog.focus();
  });
}

/** Pickup: switched on or off, and its length. */
function pickupField(timeSignature: string, pickup: number, onChange: (ticks: number) => void): HTMLElement {
  const choices = pickupChoices(timeSignature);
  const on = el('input', { type: 'checkbox', checked: pickup > 0 });
  const length = el('select', {});
  for (const c of choices) length.append(el('option', { value: String(c.ticks), textContent: c.label }));
  length.value = String(pickup > 0 ? pickup : choices[0].ticks);
  length.disabled = pickup === 0;
  on.addEventListener('change', () => {
    length.disabled = !on.checked;
    onChange(on.checked ? Number(length.value) : 0);
  });
  length.addEventListener('change', () => onChange(Number(length.value)));
  return el(
    'div',
    { className: 'field' },
    el('label', { className: 'check' }, on, el('span', { textContent: 'Auftakt' })),
    el('label', { className: 'inline' }, el('span', { textContent: 'Länge: ' }), length),
  );
}

export interface SettingsActions {
  score(): Score;
  /** Name(s), class and title changed (only complete details arrive here). */
  setMeta(meta: Meta): void;
  /** "Info und Lizenzen" (only here, to save room on the screen). */
  showInfo(): void;
  /** The welcome page again ("Kurzanleitung"). */
  showGuide(): void;
  addInstrument(id: string): void;
  removeInstrument(index: number): Promise<void>;
  /** One place up (-1) or down (+1). */
  moveInstrument(index: number, direction: -1 | 1): void;
  /** Show a transposing instrument transposed (written) or sounding. */
  setTransposed(index: number, on: boolean): void;
  setKey(key: number): void;
  setTimeSignature(text: string): void;
  setPickup(ticks: number): void;
}

/**
 * The settings menu (gear): details (name(s), class, title), instruments, key, time signature (only while the score is
 * empty), pickup. Every change applies at once and can be undone.
 */
export function showSettings(module: ModuleConfig, actions: SettingsActions): void {
  const dialog = el('dialog', { className: 'dialog wide' });
  const body = el('div', {});
  const done = textButton('Fertig', 'tool primary');
  const info = el('button', { type: 'button', className: 'link-button', textContent: 'Info und Lizenzen' });
  info.addEventListener('click', () => actions.showInfo());
  const guide = el('button', { type: 'button', className: 'link-button', textContent: 'Kurzanleitung' });
  guide.addEventListener('click', () => actions.showGuide());
  const details = detailsSection(actions.score().meta, actions);
  dialog.append(
    el('h2', { textContent: 'Einstellungen' }),
    ...details.elements,
    body,
    el('div', { className: 'dialog-actions settings-actions' }, guide, info, done),
  );

  function draw(): void {
    const score = actions.score();
    const ids = score.parts.map((p) => p.instrument);
    // In the order of the score; numbers by place (the upper violin is "Violine 1").
    const names = partNames(score);
    const list = el(
      'ul',
      { className: 'instrument-list' },
      ...names.map((name, index) => {
        const arrow = (direction: -1 | 1) => {
          const label = direction < 0 ? 'nach oben' : 'nach unten';
          const b = textButton(direction < 0 ? '↑' : '↓', 'tool arrow');
          b.setAttribute('aria-label', `${name} ${label}`);
          b.title = `${name} ${label}`;
          b.disabled = direction < 0 ? index === 0 : index === ids.length - 1;
          b.addEventListener('click', () => {
            actions.moveInstrument(index, direction);
            draw();
          });
          return b;
        };
        const remove = textButton('Entfernen');
        remove.setAttribute('aria-label', `${name} entfernen`);
        remove.disabled = ids.length <= 1;
        remove.addEventListener('click', async () => {
          await actions.removeInstrument(index);
          draw();
        });
        // Transposing instruments: a switch with the tuning ("in B"), pressed = shown transposed.
        const part = score.parts[index];
        const t = TRANSPOSITIONS[part.instrument];
        const switches: HTMLButtonElement[] = [];
        if (t) {
          const tuning = t.label === 'Oktave' ? 'Oktave' : `in ${t.label}`;
          const b = textButton(tuning, 'tool transpose');
          const on = part.transposed === true;
          b.setAttribute('aria-pressed', String(on));
          b.title = `${name}: ${on ? 'transponiert' : 'klingend'} (tippen zum Umschalten)`;
          b.setAttribute('aria-label', `${name} transponiert anzeigen (${tuning})`);
          b.addEventListener('click', () => {
            actions.setTransposed(index, !on);
            draw();
          });
          switches.push(b);
        }
        return el('li', {}, el('span', { textContent: name }), ...switches, arrow(-1), arrow(1), remove);
      }),
    );
    const staffCount = score.parts.reduce((n, p) => n + p.staves.length, 0);
    const available = INSTRUMENTS.filter((i) => !(i.id === 'piano' && ids.includes('piano')));
    const add = select('Instrument hinzufügen', available.map((i) => ({ value: i.id, label: i.name })), available[0]?.id ?? '');
    const addButton = textButton('Hinzufügen');
    const full = ids.length >= module.maxParts || staffCount >= module.maxStaves;
    addButton.disabled = full;
    add.input.disabled = full;
    addButton.addEventListener('click', () => {
      actions.addInstrument(add.input.value);
      draw();
    });

    const key = select(
      'Tonart',
      module.keySignatures.map((k) => ({ value: String(k), label: KEY_NAMES[k] ?? String(k) })),
      String(score.keySignature),
    );
    key.input.addEventListener('change', () => {
      actions.setKey(Number(key.input.value));
      draw();
    });

    const text = `${score.timeSignature.beats}/${score.timeSignature.beatValue}`;
    const hasNotes = score.parts.some((p) => p.staves.some((s) => s.measures.some((m) => m.some((e) => e.kind === 'note'))));
    const meter = select('Taktart', module.timeSignatures.map((t) => ({ value: t, label: t })), text);
    meter.input.disabled = hasNotes;
    meter.input.addEventListener('change', () => {
      actions.setTimeSignature(meter.input.value);
      draw();
    });
    const meterHint = el('p', {
      className: 'dialog-text muted-text',
      textContent: hasNotes ? 'Die Taktart lässt sich nur ändern, solange die Partitur leer ist.' : '',
    });

    const pickup = pickupField(text, score.pickup, (ticks) => {
      actions.setPickup(ticks);
      draw();
    });

    body.replaceChildren(
      el('h3', { textContent: 'Instrumente' }),
      list,
      el('div', { className: 'inline-field' }, add.field, addButton),
      el('h3', { textContent: 'Takt und Tonart' }),
      key.field,
      meter.field,
      meterHint,
      pickup,
    );
  }
  draw();

  const finish = () => {
    if (details.read()) close();
  };
  const close = showDialog(dialog, finish);
  done.addEventListener('click', finish);
  dialog.focus();
}

/**
 * "Angaben" at the top of the settings: name(s), class and title, changed right in place.
 * Every complete change applies at once; with a name or the class missing, the menu
 * cannot be closed (the error is shown instead).
 */
function detailsSection(current: Meta, actions: { setMeta(meta: Meta): void }) {
  const fields = metaFields(current, 'settings', () => {
    const meta = fields.peek();
    if (meta) actions.setMeta(meta);
  });
  return { elements: [el('h3', { textContent: 'Angaben' }), ...fields.elements], read: fields.read };
}

export interface BasicSettingsActions {
  setMeta(meta: Meta): void;
  showInfo(): void;
}

/** The settings menu of module 1 (gear): only the details and "Info und Lizenzen". */
export function showBasicSettings(current: Meta, actions: BasicSettingsActions): void {
  const dialog = el('dialog', { className: 'dialog' });
  const done = textButton('Fertig', 'tool primary');
  const info = el('button', { type: 'button', className: 'link-button', textContent: 'Info und Lizenzen' });
  info.addEventListener('click', () => actions.showInfo());
  const details = detailsSection(current, actions);
  dialog.append(
    el('h2', { textContent: 'Einstellungen' }),
    ...details.elements,
    el('div', { className: 'dialog-actions settings-actions' }, info, done),
  );
  const finish = () => {
    if (details.read()) close();
  };
  const close = showDialog(dialog, finish);
  done.addEventListener('click', finish);
  dialog.focus();
}
