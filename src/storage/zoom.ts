/**
 * Remembers the size of the music on this device (full version). localStorage may be
 * missing or blocked: then the music simply starts at normal size.
 */
const KEY = 'fermate:zoom';

export function loadZoom(): number | null {
  try {
    const value = Number(globalThis.localStorage?.getItem(KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveZoom(zoom: number): void {
  try {
    globalThis.localStorage?.setItem(KEY, String(zoom));
  } catch {
    // not saved: no problem
  }
}
