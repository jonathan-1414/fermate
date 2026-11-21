import { ICONS } from './icons';
import { button } from './toolbar';

/**
 * The overview bar below the music (full version): every measure as a small box,
 * a frame shows which part of the piece is on the screen. Tapping or dragging on the
 * bar moves the view there; this is the only way to scroll the music (a finger on the
 * music always enters notes). At its right end: "+ Takt" and "Takt löschen".
 */

export interface OverviewMeasure {
  /** Share of the whole width (0..1). */
  share: number;
  number: number | null;
  hasNotes: boolean;
}

export interface OverviewState {
  measures: OverviewMeasure[];
  /** Visible part of the music: start and width as shares of the whole width (0..1). */
  viewStart: number;
  viewWidth: number;
  cursorMeasure: number;
  canInsert: boolean;
  canDelete: boolean;
}

export interface OverviewActions {
  /** The view should be centred at this point of the whole width (0..1). */
  scrollTo(center: number): void;
  insertMeasure(): void;
  deleteMeasure(): void;
}

export interface Overview {
  update(state: OverviewState): void;
  /** Moves only the frame (while scrolling, without drawing everything again). */
  setView(viewStart: number, viewWidth: number): void;
}

export function createOverview(container: HTMLElement, actions: OverviewActions): Overview {
  const wrapper = document.createElement('div');
  wrapper.className = 'overview';

  const bar = document.createElement('div');
  bar.className = 'overview-bar';
  bar.setAttribute('role', 'slider');
  bar.setAttribute('aria-label', 'Übersicht: zu einer Stelle springen');
  bar.tabIndex = 0;
  const boxes = document.createElement('div');
  boxes.className = 'overview-boxes';
  const frame = document.createElement('div');
  frame.className = 'overview-frame';
  bar.append(boxes, frame);

  const insertButton = button('Takt', actions.insertMeasure, { text: '+' });
  const deleteButton = button('Takt löschen', actions.deleteMeasure, { svg: ICONS.cross });
  const tools = document.createElement('div');
  tools.className = 'tool-group';
  tools.append(insertButton, deleteButton);
  wrapper.append(bar, tools);
  container.append(wrapper);

  // Tapping or dragging on the bar: the view follows the finger.
  const follow = (event: PointerEvent) => {
    const rect = bar.getBoundingClientRect();
    actions.scrollTo(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
  };
  let dragging: number | null = null;
  bar.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging = event.pointerId;
    bar.setPointerCapture(event.pointerId);
    follow(event);
  });
  bar.addEventListener('pointermove', (event) => {
    if (event.pointerId === dragging) follow(event);
  });
  const stop = (event: PointerEvent) => {
    if (event.pointerId === dragging) dragging = null;
  };
  bar.addEventListener('pointerup', stop);
  bar.addEventListener('pointercancel', stop);

  function setView(viewStart: number, viewWidth: number): void {
    frame.style.left = `${viewStart * 100}%`;
    frame.style.width = `${Math.min(1, viewWidth) * 100}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(viewStart * 100)));
  }

  return {
    update(state) {
      boxes.replaceChildren(
        ...state.measures.map((m, i) => {
          const box = document.createElement('div');
          box.className = 'overview-box';
          box.style.flexGrow = String(m.share);
          if (m.hasNotes) box.classList.add('has-notes');
          if (i === state.cursorMeasure) box.classList.add('current');
          if (m.number !== null) box.textContent = String(m.number);
          return box;
        }),
      );
      setView(state.viewStart, state.viewWidth);
      insertButton.disabled = !state.canInsert;
      deleteButton.disabled = !state.canDelete;
    },
    setView,
  };
}
