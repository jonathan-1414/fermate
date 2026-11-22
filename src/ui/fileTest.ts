/**
 * TEMPORARY test page (…/?dateitest): which setting of the file picker opens the iPad's
 * "Dateien" directly (without camera and photo library) and still lets a .fermate file
 * be chosen? Remove again once the answer is known (CLAUDE.md, Block E, Punkt 17).
 */
const VARIANTS: Array<{ label: string; accept: string | null }> = [
  { label: 'A: wie jetzt (ohne Angabe)', accept: null },
  { label: 'B: nur .fermate', accept: '.fermate' },
  { label: 'C: Text und JSON', accept: '.fermate,application/json,text/plain' },
  { label: 'D: beliebige Daten', accept: '.fermate,application/octet-stream' },
  { label: 'E: alles (*/*)', accept: '*/*' },
];

export function startFileTest(root: HTMLElement): void {
  root.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'file-test';
  const heading = document.createElement('h1');
  heading.textContent = 'Test: Datei öffnen';
  const intro = document.createElement('p');
  intro.textContent =
    'Tippe nacheinander auf jeden Button. Notiere: Erscheint ein Menü mit Kamera/Fotomediathek? Lässt sich die .fermate-Datei wählen?';
  page.append(heading, intro);
  for (const variant of VARIANTS) {
    const row = document.createElement('div');
    row.className = 'file-test-row';
    const input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    if (variant.accept !== null) input.accept = variant.accept;
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'tool';
    pick.textContent = variant.label;
    pick.addEventListener('click', () => input.click());
    const result = document.createElement('span');
    result.textContent = '–';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      result.textContent = file ? `gewählt: ${file.name} (${file.size} Byte)` : 'nichts gewählt';
      input.value = '';
    });
    row.append(pick, input, result);
    page.append(row);
  }
  root.append(page);
}
