/**
 * The word mark "fermate" at the top left (design from Jonathan's logo project,
 * 23.11.2026): "ferm", a fermata in the accent colour instead of the "a", "te".
 * Drawn with our own Nunito font and colours (CSS variables), nothing loaded from outside.
 */
export function createWordmark(): HTMLElement {
  const mark = document.createElement('div');
  mark.className = 'wordmark';
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', 'fermate');
  // Our own markup, no user input.
  mark.innerHTML =
    '<span aria-hidden="true">ferm</span>' +
    '<svg aria-hidden="true" viewBox="0 17 72 45" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M2 62 A34 45 0 0 1 70 62 L61 62 A25 31 0 0 0 11 62 Z"/>' +
    '<circle cx="36" cy="53.5" r="8.5"/>' +
    '</svg>' +
    '<span aria-hidden="true">te</span>';
  return mark;
}
