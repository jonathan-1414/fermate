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

export interface VerticalOverviewState {
  /** One box per staff (short name of the instrument at its first staff). */
  rows: Array<{ share: number; label: string }>;
  viewStart: number;
  viewHeight: number;
  /** Only shown when not all staves fit into the height. */
  visible: boolean;
}

export interface VerticalOverview {
  update(state: VerticalOverviewState): void;
  setView(viewStart: number, viewHeight: number): void;
}

/**
 * The narrow vertical overview bar next to the music: when not all staves fit into the
 * height, it shows them as boxes; tapping or dragging moves the view up and down.
 */
export function createVerticalOverview(container: HTMLElement, scrollTo: (center: number) => void): VerticalOverview {
  container.classList.add('overview-v');
  container.setAttribute('role', 'slider');
  container.setAttribute('aria-orientation', 'vertical');
  container.setAttribute('aria-label', 'Übersicht der Notenzeilen: zu einer Zeile springen');
  const boxes = document.createElement('div');
  boxes.className = 'overview-v-boxes';
  const frame = document.createElement('div');
  frame.className = 'overview-frame';
  container.append(boxes, frame);

  const follow = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    scrollTo(Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)));
  };
  let dragging: number | null = null;
  container.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging = event.pointerId;
    container.setPointerCapture(event.pointerId);
    follow(event);
  });
  container.addEventListener('pointermove', (event) => {
    if (event.pointerId === dragging) follow(event);
  });
  const stop = (event: PointerEvent) => {
    if (event.pointerId === dragging) dragging = null;
  };
  container.addEventListener('pointerup', stop);
  container.addEventListener('pointercancel', stop);

  function setView(viewStart: number, viewHeight: number): void {
    frame.style.top = `${viewStart * 100}%`;
    frame.style.height = `${Math.min(1, viewHeight) * 100}%`;
  }

  return {
    update(state) {
      container.hidden = !state.visible;
      boxes.replaceChildren(
        ...state.rows.map((row) => {
          const box = document.createElement('div');
          box.className = 'overview-box';
          box.style.flexGrow = String(row.share);
          box.textContent = row.label;
          return box;
        }),
      );
      setView(state.viewStart, state.viewHeight);
    },
    setView,
  };
}
