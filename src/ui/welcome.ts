import { el, showDialog, textButton } from './dialogs';
import { createWordmark } from './wordmark';

/**
 * The welcome page of the full version (23.11.2026): what Fermate is, that it is a test
 * version, and the few things to know about using it, with a picture for marking.
 * Shown at the very first start on a device, later via "Kurzanleitung" in the settings.
 */

/** Three small pictures: tap the first note, hold on the last one, marked. */
function markingPicture(): HTMLElement {
  // Our own drawing (no user input): staff lines, four notes, a finger as a ring.
  const staff = '<path d="M4 14H116M4 22H116M4 30H116M4 38H116M4 46H116" class="lines"/>';
  const notes = [
    [24, 38],
    [48, 34],
    [72, 30],
    [96, 26],
  ];
  const heads = (accentFirst: boolean) =>
    notes
      .map(
        ([x, y], i) =>
          `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="4" transform="rotate(-20 ${x} ${y})" class="${accentFirst && i === 0 ? 'accent' : 'note'}"/>` +
          `<path d="M${x + 5} ${y - 1}V${y - 24}" class="stem${accentFirst && i === 0 ? ' accent-stroke' : ''}"/>`,
      )
      .join('');
  const finger = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="10" class="finger"/>`;
  const panel = (inner: string, caption: string, number: string) =>
    el(
      'figure',
      { className: 'welcome-step' },
      Object.assign(document.createElement('div'), {
        className: 'welcome-picture',
        innerHTML: `<svg viewBox="0 0 120 56" aria-hidden="true">${inner}</svg>`,
      }),
      el('figcaption', {}, el('span', { className: 'step-number', textContent: number }), caption),
    );
  return el(
    'div',
    { className: 'welcome-steps' },
    panel(staff + heads(true) + finger(24, 38), 'Erste Note antippen', '1'),
    panel(staff + heads(true) + finger(96, 26), 'Auf der letzten Note den Finger kurz liegen lassen', '2'),
    panel(`<rect x="16" y="6" width="92" height="46" rx="4" class="marked"/>` + staff + heads(true), 'Markiert: kopieren, löschen, versetzen …', '3'),
  );
}

/** Shows the welcome page; resolves when it is closed. */
export function showWelcome(buttonLabel = 'Los geht’s'): Promise<void> {
  return new Promise((resolve) => {
    const dialog = el('dialog', { className: 'dialog info welcome' });
    const go = textButton(buttonLabel, 'tool primary');
    const mark = createWordmark();
    mark.classList.add('large');
    const item = (title: string, text: string) => el('li', {}, el('strong', { textContent: title }), ` ${text}`);
    dialog.append(
      el('div', { className: 'welcome-head' }, mark, el('p', { className: 'welcome-tagline', textContent: 'Notensatz für den Musikunterricht, schlicht, fürs iPad gemacht' })),
      el(
        'p',
        { className: 'welcome-test' },
        el('strong', { textContent: 'Testversion: ' }),
        'Fermate wird gerade erprobt. Manches ändert sich noch, Rückmeldungen sind willkommen.',
      ),
      el(
        'ul',
        {},
        item('Schreiben und hören:', 'Jede Melodie lässt sich sofort mit echten Instrumentenklängen abspielen.'),
        item('Bewusst reduziert:', 'nur, was im Unterricht gebraucht wird. Bis zu 10 Instrumente, Klavier mit Akkorden, gängige Takt- und Tonarten.'),
        item('Ruhig gestaltet:', 'Das Notenbild steht im Mittelpunkt.'),
        item('Ohne Konto:', 'Alles bleibt auf dem Gerät. Speichern als Datei, PDF, Weitergabe über das Teilen-Menü. Export als Audiodatei folgt.'),
      ),
      el('h3', { textContent: 'So geht’s' }),
      el(
        'ul',
        {},
        el('li', { textContent: 'Notenwert unten wählen, aufs Notensystem tippen.' }),
        el('li', { textContent: 'Antippen wählt aus, ein zweiter Tipp ändert.' }),
        el('li', {}, el('strong', { textContent: 'Markieren:' }), ' Ganze Takte: auf die Taktnummer tippen. Sonst so:'),
      ),
      markingPicture(),
      el('div', { className: 'dialog-actions' }, go),
    );
    const close = showDialog(dialog, null);
    go.addEventListener('click', () => {
      close();
      resolve();
    });
    go.focus();
  });
}
