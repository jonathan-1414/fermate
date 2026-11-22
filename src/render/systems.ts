/**
 * Splits the measures into lines (systems) for printing: as many measures per line as fit
 * into the width, at least one. The first line also holds the time signature.
 * Returns, for every line, the indexes of its measures.
 */
export function breakIntoSystems(widths: number[], available: number, firstExtra: number): number[][] {
  const systems: number[][] = [];
  let line: number[] = [];
  let used = 0;
  widths.forEach((width, i) => {
    const room = available - (systems.length === 0 ? firstExtra : 0);
    if (line.length > 0 && used + width > room) {
      systems.push(line);
      line = [];
      used = 0;
    }
    line.push(i);
    used += width;
  });
  if (line.length > 0) systems.push(line);
  return systems;
}

/**
 * How much the measures of a line are stretched so that it ends at the right edge.
 * A short last line keeps its natural width (it would look pulled apart).
 */
export function stretchFactor(natural: number, available: number, isLast: boolean): number {
  if (natural >= available) return available / natural;
  if (isLast && natural < 0.6 * available) return 1;
  return available / natural;
}
