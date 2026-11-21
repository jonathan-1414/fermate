import type { BaseValue, Duration } from '../model/types';
import { DURATION_NAMES } from '../model/constants';
import { ICONS } from './icons';
import { DURATION_GLYPHS, button, iconButton } from './toolbar';
import type { RevealPhase } from './timedReveal';

/**
 * The two toolbars of the full version (CLAUDE.md, section 5, "Leisten"):
 * at the top what concerns the whole piece, at the bottom what is needed for writing.
 */

/** Music font symbols (SMuFL code points in Bravura). */
const GLYPH = {
  dot: '',
  triplet: '',
  sharp: '',
  flat: '',
  natural: '',
};

export interface FullToolbarState {
  duration: Duration;
  /** Note values offered (values that never fit into a measure are hidden). */
  bases: BaseValue[];
  canDot: boolean;
  /** Triplets are offered at all (not in 6/8). */
  tripletsShown: boolean;
  canTriplet: boolean;
  /** Alter of the selected note, or null when no note is selected. */
  alter: -1 | 0 | 1 | null;
  /** Tie of the selected note, or null when no note is selected. */
  tie: boolean | null;
  /** The "Akkord" button is shown (only for an instrument with chords: the piano). */
  chordShown: boolean;
  chordMode: boolean;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
  playing: boolean;
  /** Tempo as shown on its button: the beat (music font) and the number. */
  tempoGlyph: string;
  tempo: number;
}

export interface FullToolbarActions {
  togglePlay(): void;
  openTempo(): void;
  openMixer(): void;
  undo(): void;
  redo(): void;
  showNoteNames(): void;
  newScore(): void;
  handIn(): void;
  openSettings(): void;
  selectBase(base: BaseValue): void;
  toggleDot(): void;
  toggleTriplet(): void;
  setAccidental(alter: -1 | 0 | 1): void;
  toggleTie(): void;
  toggleChord(): void;
  deleteSelection(): void;
}

export interface FullToolbar {
  update(state: FullToolbarState): void;
  setNoteNamesPhase(phase: RevealPhase, durationMs: number): void;
}

function group(label: string, ...buttons: HTMLButtonElement[]): HTMLDivElement {
  const g = document.createElement('div');
  g.className = 'tool-group';
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', label);
  g.append(...buttons);
  return g;
}

export function createFullToolbar(top: HTMLElement, bottom: HTMLElement, actions: FullToolbarActions): FullToolbar {
  // Top: playing, undo/redo, note names; new and hand in in the corner.
  const playButton = button('Abspielen', actions.togglePlay, { text: '▶' });
  playButton.classList.add('play');
  const playLabel = playButton.querySelector('span:not(.glyph)')!;
  const playGlyph = playButton.querySelector('.glyph')!;
  // Tempo: shows "♩ = 90" and opens a slider.
  const tempoButton = button('', actions.openTempo, { music: '' });
  tempoButton.setAttribute('aria-label', 'Tempo');
  const tempoGlyph = tempoButton.querySelector('.glyph')!;
  const tempoLabel = tempoButton.querySelector('span:not(.glyph)')!;
  const mixerButton = button('Mischpult', actions.openMixer);
  const undoButton = button('Rückgängig', actions.undo, { svg: ICONS.undo });
  const redoButton = button('Wiederholen', actions.redo, { svg: ICONS.redo });
  const namesButton = button('Notennamen', actions.showNoteNames);
  namesButton.classList.add('timed');
  const namesBar = document.createElement('span');
  namesBar.className = 'time-bar';
  namesBar.setAttribute('aria-hidden', 'true');
  namesButton.prepend(namesBar);

  const topMain = document.createElement('div');
  topMain.className = 'toolbar-main';
  topMain.append(group('Wiedergabe', playButton, tempoButton, mixerButton), group('Bearbeiten', undoButton, redoButton, namesButton));
  const corner = group(
    'Partitur',
    iconButton('Neue Partitur', ICONS.plus, actions.newScore),
    iconButton('Abgeben', ICONS.share, actions.handIn),
    iconButton('Einstellungen', ICONS.gear, actions.openSettings),
  );
  corner.classList.add('corner');
  top.append(topMain, corner);

  // Bottom: note values, dot, triplet | accidentals | tie, delete.
  const bases: BaseValue[] = [192, 96, 48, 24, 12];
  const baseButtons = bases.map((base) => {
    const b = button(DURATION_NAMES[base], () => actions.selectBase(base), { music: DURATION_GLYPHS[base] });
    b.classList.add('duration');
    return { base, b };
  });
  const dotButton = button('Punkt', actions.toggleDot, { music: GLYPH.dot });
  const tripletButton = button('Triole', actions.toggleTriplet, { music: GLYPH.triplet });
  const accidentalButtons = (
    [
      [1, 'Kreuz', GLYPH.sharp],
      [-1, 'Be', GLYPH.flat],
      [0, 'Auflösung', GLYPH.natural],
    ] as const
  ).map(([alter, label, glyph]) => {
    const b = button(label, () => actions.setAccidental(alter), { music: glyph });
    b.classList.add('accidental');
    return { alter, b };
  });
  const tieButton = button('Haltebogen', actions.toggleTie, { svg: ICONS.tie });
  // Akkord: while pressed, a tap adds a tone to the selected note instead of moving it.
  const chordButton = button('Akkord', actions.toggleChord);
  const deleteButton = button('Löschen', actions.deleteSelection, { svg: ICONS.cross });

  const bottomMain = document.createElement('div');
  bottomMain.className = 'toolbar-main';
  bottomMain.append(
    group('Notenwert', ...baseButtons.map(({ b }) => b), dotButton, tripletButton),
    group('Vorzeichen', ...accidentalButtons.map(({ b }) => b)),
    group('Note', tieButton, chordButton, deleteButton),
  );
  bottom.append(bottomMain);

  return {
    update(state) {
      for (const { base, b } of baseButtons) {
        b.hidden = !state.bases.includes(base);
        b.setAttribute('aria-pressed', String(base === state.duration.base));
      }
      dotButton.setAttribute('aria-pressed', String(state.duration.dotted));
      dotButton.disabled = !state.canDot;
      tripletButton.hidden = !state.tripletsShown;
      tripletButton.setAttribute('aria-pressed', String(state.duration.triplet));
      tripletButton.disabled = !state.canTriplet;
      for (const { alter, b } of accidentalButtons) {
        b.disabled = state.alter === null;
        b.setAttribute('aria-pressed', String(state.alter === alter));
      }
      tieButton.disabled = state.tie === null;
      chordButton.hidden = !state.chordShown;
      chordButton.setAttribute('aria-pressed', String(state.chordMode));
      tieButton.setAttribute('aria-pressed', String(state.tie === true));
      deleteButton.disabled = !state.canDelete;
      undoButton.disabled = !state.canUndo;
      redoButton.disabled = !state.canRedo;
      playLabel.textContent = state.playing ? 'Stopp' : 'Abspielen';
      playGlyph.textContent = state.playing ? '■' : '▶';
      playButton.setAttribute('aria-pressed', String(state.playing));
      tempoGlyph.textContent = state.tempoGlyph;
      tempoLabel.textContent = `= ${state.tempo}`;
      tempoButton.setAttribute('aria-label', `Tempo ${state.tempo}`);
    },

    setNoteNamesPhase(phase, durationMs) {
      namesButton.dataset.phase = phase;
      namesButton.disabled = phase === 'cooldown';
      namesButton.setAttribute('aria-pressed', String(phase === 'showing'));
      if (phase === 'idle') return;
      const [from, to] = phase === 'showing' ? [1, 0] : [0, 1];
      namesBar.style.transition = 'none';
      namesBar.style.transform = `scaleX(${from})`;
      void namesBar.offsetWidth;
      namesBar.style.transition = `transform ${durationMs}ms linear`;
      namesBar.style.transform = `scaleX(${to})`;
    },
  };
}
