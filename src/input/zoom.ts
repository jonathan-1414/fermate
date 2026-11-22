/**
 * Zooming the music (full version): the arithmetic, without any screen.
 */

/** Keeps the zoom between the smallest and the largest size. */
export function clampZoom(zoom: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, zoom));
}

/**
 * The new scroll position after zooming, so that the point under the fingers stays where
 * it is. `scroll` is the old scroll position, `center` the fingers' position on the visible
 * part (both in screen pixels).
 */
export function scrollAfterZoom(scroll: number, center: number, oldZoom: number, newZoom: number): number {
  return ((scroll + center) * newZoom) / oldZoom - center;
}

/** Ctrl + mouse wheel (or two fingers on a trackpad): one wheel step changes the size by about 10 %. */
export function zoomForWheel(zoom: number, deltaY: number): number {
  return zoom * Math.exp(-deltaY * 0.002);
}
