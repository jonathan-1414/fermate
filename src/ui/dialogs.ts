import { cleanMeta, type Meta, type MetaError } from '../model/meta';

/**
 * Dialogs: the start dialog (who writes, which class, title) and a yes/no question.
 * Built on the browser's <dialog> element, so they work with touch, keyboard and screen readers.
 */

const MAX_NAMES = 6;

const ERROR_TEXTS: Record<MetaError, string> = {
  'names-missing': 'Bitte mindestens einen Namen eintragen.',
  'class-missing': 'Bitte die Klasse eintragen.',
};

/** Creates an element with properties (e.g. textContent, type) and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element: HTMLElementTagNameMap[K] = document.createElement(tag);
  Object.assign(element, props);
  element.append(...children);
  return element;
}

export function textButton(label: string, className = 'tool'): HTMLButtonElement {
  return el('button', { type: 'button', className, textContent: label });
}

/**
 * Shows a modal dialog. Returns `finish`, which closes and removes it.
 * The answer is passed on directly instead of relying on the dialog's own 'close'
 * event (that event is not delivered reliably while a page is in the background).
 */
export function showDialog(dialog: HTMLDialogElement, onEscape: (() => void) | null): () => void {
  dialog.addEventListener('cancel', (event) => {
    // The start dialog cannot be closed with Escape: name and class are required.
    event.preventDefault();
    onEscape?.();
  });
  document.body.append(dialog);
  dialog.showModal();
  return () => {
    dialog.close();
    dialog.remove();
  };
}

export interface MetaFields {
  /** The fields (names, class, title) and the error line. */
  elements: HTMLElement[];
  /** Checks what was typed: the cleaned details, or null (then the error is shown). */
  read(): Meta | null;
  /** The same without showing an error (while typing). */
  peek(): Meta | null;
}

/**
 * The fields for name(s), class and title, used in the start dialog and in the
 * settings menu. `onInput` runs after every change.
 */
export function metaFields(current: Meta, idPrefix: string, onInput: () => void = () => {}): MetaFields {
  // Names: one field per person, more can be added.
  const nameList = el('div', { className: 'name-list' });
  const addButton = textButton('+ Weitere Person', 'tool small');
  const nameInputs = () => [...nameList.querySelectorAll('input')];
  function addName(value: string): void {
    const index = nameInputs().length + 1;
    const input = el('input', { type: 'text', value, maxLength: 40, autocomplete: 'off', name: `name-${index}` });
    input.setAttribute('aria-label', `Name ${index}`);
    const row = el('div', { className: 'name-row' }, input);
    if (index > 1) {
      const remove = textButton('✕', 'tool small');
      remove.setAttribute('aria-label', 'Name entfernen');
      remove.addEventListener('click', () => {
        row.remove();
        addButton.hidden = false;
        changed();
      });
      row.append(remove);
    }
    nameList.append(row);
    addButton.hidden = nameInputs().length >= MAX_NAMES;
  }
  (current.names.length ? current.names : ['']).forEach(addName);
  addButton.addEventListener('click', () => {
    addName('');
    nameInputs().at(-1)?.focus();
  });

  const classId = `${idPrefix}-class`;
  const titleId = `${idPrefix}-title`;
  const classInput = el('input', { type: 'text', value: current.className, maxLength: 10, autocomplete: 'off', id: classId });
  const titleInput = el('input', { type: 'text', value: current.title, maxLength: 60, autocomplete: 'off', id: titleId });
  const error = el('p', { className: 'dialog-error' });
  error.setAttribute('role', 'alert');

  const names = el('fieldset', { className: 'field' }, el('legend', { textContent: 'Name(n)' }), nameList, addButton);
  function changed(): void {
    error.textContent = '';
    onInput();
  }
  for (const part of [names, classInput, titleInput]) part.addEventListener('input', changed);

  const clean = () =>
    cleanMeta({ title: titleInput.value, names: nameInputs().map((i) => i.value), className: classInput.value });

  return {
    elements: [
      names,
      el('div', { className: 'field' }, el('label', { htmlFor: classId, textContent: 'Klasse' }), classInput),
      el('div', { className: 'field' }, el('label', { htmlFor: titleId, textContent: 'Titel (freiwillig)' }), titleInput),
      error,
    ],
    peek() {
      const cleaned = clean();
      return cleaned.ok ? cleaned.meta : null;
    },
    read() {
      const cleaned = clean();
      if (cleaned.ok) return cleaned.meta;
      error.textContent = cleaned.errors.map((e) => ERROR_TEXTS[e]).join(' ');
      (cleaned.errors[0] === 'names-missing' ? nameInputs()[0] : classInput).focus();
      return null;
    },
  };
}

/**
 * The start dialog: asks for name(s), class and title. It cannot be cancelled.
 */
export function askForMeta(current: Meta): Promise<Meta> {
  return new Promise((resolve) => {
    const dialog = el('dialog', { className: 'dialog' });
    const form = el('form', { noValidate: true });
    const fields = metaFields(current, 'meta');
    const submit = el('button', { type: 'submit', className: 'tool primary', textContent: 'Los geht’s' });
    form.append(
      el('h2', { textContent: 'Neue Partitur' }),
      el('p', { className: 'dialog-text', textContent: 'Trag ein, wer an dieser Partitur schreibt.' }),
      ...fields.elements,
      el('div', { className: 'dialog-actions' }, submit),
    );
    dialog.append(form);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const meta = fields.read();
      if (!meta) return;
      close();
      resolve(meta);
    });
    const close = showDialog(dialog, null);
  });
}

/** A yes/no question. Resolves true if confirmed. */
export function confirm(text: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = el('dialog', { className: 'dialog' });
    const cancel = textButton('Abbrechen');
    const ok = textButton(confirmLabel, 'tool primary');
    dialog.append(el('p', { className: 'dialog-text', textContent: text }), el('div', { className: 'dialog-actions' }, cancel, ok));
    const close = showDialog(dialog, () => done(false));
    function done(answer: boolean): void {
      close();
      resolve(answer);
    }
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    cancel.focus();
  });
}

export type HandInFormat = 'fermate' | 'pdf';

/**
 * The hand-in dialog: choose the formats (none chosen at first), then share.
 * The file is prepared as soon as the choice changes, so that sharing can start
 * directly from the tap (browsers only allow the share menu right after a touch).
 */
export function askHandIn(options: {
  fileName(formats: HandInFormat[]): string;
  prepare(formats: HandInFormat[]): Promise<File>;
  canShare(file: File): boolean;
  deliver(file: File): Promise<void>;
}): Promise<void> {
  return new Promise((resolve) => {
    const dialog = el('dialog', { className: 'dialog' });
    const choices: Array<[HandInFormat, string]> = [
      ['fermate', 'Fermate-Datei'],
      ['pdf', 'PDF'],
    ];
    const boxes = choices.map(([format, label]) => {
      const input = el('input', { type: 'checkbox', checked: false, value: format });
      return { format, input, row: el('label', { className: 'check-row' }, input, label) };
    });
    const nameLine = el('p', { className: 'dialog-text file-name' });
    const hint = el('p', { className: 'dialog-error' });
    hint.setAttribute('role', 'alert');
    const cancel = textButton('Abbrechen');
    const send = el('button', { type: 'button', className: 'tool primary' });

    dialog.append(
      el('h2', { textContent: 'Abgeben' }),
      el('fieldset', { className: 'field' }, el('legend', { textContent: 'Was möchtest du abgeben?' }), ...boxes.map((b) => b.row)),
      nameLine,
      hint,
      el('div', { className: 'dialog-actions' }, cancel, send),
    );

    let file: File | null = null;
    let request = 0;
    async function update(): Promise<void> {
      const formats = boxes.filter((b) => b.input.checked).map((b) => b.format);
      file = null;
      const mine = ++request;
      hint.textContent = '';
      if (formats.length === 0) {
        nameLine.textContent = 'Wähle mindestens ein Format.';
        send.textContent = 'Teilen';
        send.disabled = true;
        return;
      }
      nameLine.textContent = `Datei: ${options.fileName(formats)}`;
      send.textContent = 'Wird vorbereitet …';
      send.disabled = true;
      try {
        const prepared = await options.prepare(formats);
        if (mine !== request) return; // the choice changed in the meantime
        file = prepared;
        send.textContent = options.canShare(prepared) ? 'Teilen' : 'Herunterladen';
        send.disabled = false;
      } catch {
        if (mine !== request) return;
        hint.textContent = 'Die Datei konnte nicht erstellt werden. Bitte noch einmal versuchen.';
        send.textContent = 'Teilen';
      }
    }
    boxes.forEach((b) => b.input.addEventListener('change', () => void update()));

    const close = showDialog(dialog, () => done());
    // Focus the dialog itself, not the first checkbox: otherwise Safari draws a focus ring
    // around it, which looks as if it had been chosen.
    dialog.tabIndex = -1;
    dialog.focus();
    function done(): void {
      request++;
      close();
      resolve();
    }
    cancel.addEventListener('click', () => done());
    send.addEventListener('click', () => {
      if (!file) return;
      const ready = file;
      void options.deliver(ready).finally(done);
    });
    void update();
  });
}

/** A link that opens in a new tab, so the score stays open. */
function externalLink(text: string, href: string): HTMLAnchorElement {
  return el('a', { href, textContent: text, target: '_blank', rel: 'noopener noreferrer' });
}

/** One entry of the info dialog: what it is, who made it, which license. */
function credit(name: string, href: string, ...details: (Node | string)[]): HTMLLIElement {
  return el('li', {}, externalLink(name, href), ...details);
}

/** Info and licenses: what Fermate uses and under which terms. */
export function showInfo(): void {
  const dialog = el('dialog', { className: 'dialog info' });
  const ok = textButton('Schließen', 'tool primary');
  dialog.append(
    el('h2', { textContent: 'Info und Lizenzen' }),
    el(
      'p',
      { className: 'dialog-text' },
      'Fermate ist ein kleines Notensatzprogramm für den Musikunterricht. Alle Daten bleiben auf diesem Gerät, es gibt keinen Server und keine Anmeldung. Der ',
      externalLink('Quellcode', 'https://github.com/jonathan-1414/fermate'),
      ' steht unter der Lizenz GNU AGPL 3.0.',
    ),
    el('h3', { textContent: 'Klang' }),
    el(
      'ul',
      {},
      credit(
        'Instrumenten-Samples aus tonejs-instruments',
        'https://github.com/nbrosowsky/tonejs-instruments',
        ' von Nicholaus P. Brosowsky (Klavier, Flöte, Klarinette, Saxofon, Fagott, Horn, Trompete, Posaune, Tuba, Violine, Violoncello, Kontrabass; die Viola klingt aus Cello- und Violinen-Aufnahmen), Aufnahmen u. a.: Versilian Studios (VSO2). Lizenz: ',
        externalLink('CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/deed.de'),
        '. Unverändert verwendet.',
      ),
    ),
    el('h3', { textContent: 'Schriften' }),
    el(
      'ul',
      {},
      credit('Nunito', 'https://github.com/googlefonts/nunito', ' von The Nunito Project Authors, SIL Open Font License 1.1'),
      credit('Bravura', 'https://github.com/steinbergmedia/bravura', ' (Notenzeichen) von Steinberg Media Technologies, SIL Open Font License 1.1'),
      credit('Academico', 'https://github.com/vexflow/vexflow-fonts', ' (Text im Notenbild) von Steinberg Media Technologies, SIL Open Font License 1.1'),
    ),
    el('h3', { textContent: 'Bibliotheken' }),
    el(
      'ul',
      {},
      credit('VexFlow', 'https://github.com/vexflow/vexflow', ' (Notenbild), MIT-Lizenz'),
      credit('Tone.js', 'https://github.com/Tonejs/Tone.js', ' (Wiedergabe), MIT-Lizenz'),
      credit('jsPDF', 'https://github.com/parallax/jsPDF', ' (PDF), MIT-Lizenz'),
      credit('fflate', 'https://github.com/101arrowz/fflate', ' (ZIP), MIT-Lizenz'),
    ),
    el('div', { className: 'dialog-actions' }, ok),
  );
  const close = showDialog(dialog, () => close());
  ok.addEventListener('click', () => close());
  dialog.focus();
}
