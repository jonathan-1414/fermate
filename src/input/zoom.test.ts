import { describe, expect, it } from 'vitest';
import { clampZoom, scrollAfterZoom, zoomForWheel } from './zoom';

describe('zooming the music', () => {
  it('stays between the smallest and the largest size', () => {
    expect(clampZoom(0.5, 0.7, 2.8)).toBe(0.7);
    expect(clampZoom(3, 0.7, 2.8)).toBe(2.8);
    expect(clampZoom(1.4, 0.7, 2.8)).toBe(1.4);
  });

  it('the point under the fingers stays in its place', () => {
    // At 100 px from the left edge of the view, scrolled by 300: the music point is at 400.
    const scroll = scrollAfterZoom(300, 100, 1, 2);
    expect(scroll).toBe(700); // the point is now at 800, still 100 px from the edge
    expect(scrollAfterZoom(700, 100, 2, 1)).toBe(300);
  });

  it('the wheel makes it larger when turned up and smaller when turned down', () => {
    expect(zoomForWheel(1, -50)).toBeGreaterThan(1);
    expect(zoomForWheel(1, 50)).toBeLessThan(1);
    expect(zoomForWheel(1, 0)).toBe(1);
  });
});
