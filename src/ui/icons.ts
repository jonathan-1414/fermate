/**
 * Symbols drawn as SVG, so that they look the same on every device.
 * They take the text colour of their button (currentColor).
 */
const svg = (paths: string, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${size < 24 ? 2.2 : 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  /** Share (box with arrow up), as known from the iPad: hand in. */
  share: svg(
    '<path d="M8 9H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1h-2"/><path d="M12 3v11"/><path d="M8.5 6.5 12 3l3.5 3.5"/>',
  ),
  /** Gear: settings (full version). */
  gear: svg(
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.6"/>',
  ),
  /** Plus: new score. */
  plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  /** Pencil: the header with title, names and class can be changed (small). */
  /** Arrow turning back: undo (small, in front of the label). */
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', 18),
  /** Arrow turning forward: redo (small, in front of the label). */
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>', 18),
  /** A tie between two notes (small, in front of the label). */
  tie: svg('<path d="M4 9c3 6 13 6 16 0"/>', 18),
  /** Two overlapping sheets: copy (as known from other apps). */
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  /** Clipboard: paste (as known from other apps). */
  paste: svg('<path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><rect x="9" y="2.5" width="6" height="3.5" rx="1"/><path d="M9 11h6M9 15h4"/>'),
  /** Cross: delete (small, in front of the label). */
  cross: svg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>', 18),
};
