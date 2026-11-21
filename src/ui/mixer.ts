import { el, showDialog, textButton } from './dialogs';

/**
 * The mixer (full version): a window over the music with one row per instrument:
 * volume, mute ("Stumm") and solo. Every change applies at once, also while playing.
 */
export interface MixerPart {
  name: string;
  volume: number; // 0..1
  mute: boolean;
  solo: boolean;
}

export function showMixer(parts: MixerPart[], onChange: (parts: MixerPart[]) => void): void {
  const current = parts.map((p) => ({ ...p }));
  const dialog = el('dialog', { className: 'dialog mixer' });
  const rows = current.map((part) => {
    const slider = el('input', {
      type: 'range',
      min: '0',
      max: '100',
      value: String(Math.round(part.volume * 100)),
      className: 'mixer-volume',
    });
    slider.setAttribute('aria-label', `Lautstärke ${part.name}`);
    const mute = textButton('Stumm');
    const solo = textButton('Solo');
    const name = el('span', { className: 'mixer-name', textContent: part.name });
    const sync = () => {
      mute.setAttribute('aria-pressed', String(part.mute));
      solo.setAttribute('aria-pressed', String(part.solo));
      name.classList.toggle('muted', part.mute);
    };
    slider.addEventListener('input', () => {
      part.volume = Number(slider.value) / 100;
      onChange(current.map((p) => ({ ...p })));
    });
    mute.addEventListener('click', () => {
      part.mute = !part.mute;
      sync();
      onChange(current.map((p) => ({ ...p })));
    });
    solo.addEventListener('click', () => {
      part.solo = !part.solo;
      sync();
      onChange(current.map((p) => ({ ...p })));
    });
    sync();
    return el('div', { className: 'mixer-row' }, name, slider, mute, solo);
  });
  const done = textButton('Fertig', 'tool primary');
  dialog.append(el('h2', { textContent: 'Mischpult' }), ...rows, el('div', { className: 'dialog-actions' }, done));
  const close = showDialog(dialog, () => close());
  done.addEventListener('click', () => close());
  dialog.focus();
}

/**
 * The tempo: a window with a slider (40 to 200 beats per minute). `unit` is the beat
 * as a music font symbol (quarter, in 6/8 dotted quarter, in 2/2 half).
 */
export function showTempo(unit: string, beats: number, onChange: (beats: number) => void): void {
  const dialog = el('dialog', { className: 'dialog tempo' });
  const value = el('span', { className: 'tempo-value' });
  const symbol = el('span', { className: 'glyph music', textContent: unit });
  symbol.setAttribute('aria-hidden', 'true');
  const slider = el('input', { type: 'range', min: '40', max: '200', value: String(beats), className: 'tempo-slider' });
  slider.setAttribute('aria-label', 'Tempo (Schläge pro Minute)');
  const show = () => {
    value.textContent = `= ${slider.value}`;
  };
  slider.addEventListener('input', () => {
    show();
    onChange(Number(slider.value));
  });
  show();
  const done = textButton('Fertig', 'tool primary');
  dialog.append(
    el('h2', { textContent: 'Tempo' }),
    el('p', { className: 'tempo-line' }, symbol, value),
    slider,
    el('div', { className: 'dialog-actions' }, done),
  );
  const close = showDialog(dialog, () => close());
  done.addEventListener('click', () => close());
  dialog.focus();
}
