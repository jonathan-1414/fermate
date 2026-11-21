import type { Score } from '../model/types';
import { ICONS } from './icons';

/**
 * Header above the music, as on printed sheet music: the title in the middle,
 * names and class on the right (where the composer usually stands).
 * The whole header is one button: tapping it opens the details dialog.
 */
export interface ScoreHeader {
  update(meta: Score['meta']): void;
}

export function createScoreHeader(container: HTMLElement, onClick: () => void): ScoreHeader {
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'score-header';
  header.title = 'Angaben ändern';

  // Read out first by screen readers, not shown.
  const hint = document.createElement('span');
  hint.className = 'visually-hidden';
  hint.textContent = 'Angaben ändern: ';

  const title = document.createElement('span');
  title.className = 'score-title';

  const people = document.createElement('span');
  people.className = 'score-people';
  const peopleText = document.createElement('span');
  const pencil = document.createElement('span');
  pencil.className = 'score-edit';
  pencil.innerHTML = ICONS.pencil; // our own SVG (see icons.ts), not user input
  people.append(peopleText, pencil);

  header.append(hint, title, people);
  header.addEventListener('click', onClick);
  container.prepend(header); // above the music

  return {
    update(meta) {
      title.textContent = meta.title;
      const names = meta.names.join(', ');
      peopleText.textContent = meta.className ? `${names} · ${meta.className}` : names;
    },
  };
}
