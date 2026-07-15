import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TrackWave, COLS, waveBars } from './TrackWave';

// A 1-second 44.1kHz buffer -> 200 buckets, plenty to downsample to COLS.
const peaks = new Float32Array(400).fill(0.5);

// Each bar contributes exactly one sub-path, which always starts with an
// uppercase 'M' (coordinates and the h/V/Z commands never contain one), so
// counting 'M's counts the bars drawn into a given <path>.
const barCount = (d: string | null) => (d?.match(/M/g) ?? []).length;

describe('TrackWave', () => {
  afterEach(cleanup);

  it('renders exactly two paths (played + unplayed), never per-bar nodes', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0.5} />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });

  it('draws no played bars for a track that was never opened', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0} />);
    const played = container.querySelector('path.played');
    expect(barCount(played!.getAttribute('d'))).toBe(0);
  });

  // This is the whole point of the preview: the amber part is how far you got.
  it('splits the bars into played / unplayed at the progress boundary', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0.5} />);
    const played = container.querySelector('path.played')!;
    const rest = container.querySelector('path:not(.played)')!;
    expect(barCount(played.getAttribute('d'))).toBe(COLS / 2);
    expect(barCount(rest.getAttribute('d'))).toBe(COLS / 2);
  });

  it('marks every bar as played at the end of the track', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={1} />);
    const played = container.querySelector('path.played')!;
    const rest = container.querySelector('path:not(.played)')!;
    expect(barCount(played.getAttribute('d'))).toBe(COLS);
    expect(barCount(rest.getAttribute('d'))).toBe(0);
  });

  // The wave is decoration next to the track's name — a screen reader must not
  // read it out.
  it('is hidden from assistive tech', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('waveBars', () => {
  it('returns exactly `colCount` bars', () => {
    expect(waveBars(peaks, 120)).toHaveLength(120);
  });

  // Real min/max, not a mirrored amplitude: the bar must be asymmetric around
  // the centre line exactly like the player canvas.
  it('preserves true min/max asymmetry', () => {
    // One bucket: max 0.8 (above centre), min -0.2 (just below). MID = 10.
    const [bar] = waveBars(new Float32Array([-0.2, 0.8]), 1);
    expect(bar.top).toBeCloseTo(2); // 10 - 0.8*10
    expect(bar.bottom).toBeCloseTo(12); // 10 - (-0.2)*10
    // Asymmetric: the top reaches further from centre than the bottom.
    expect(10 - bar.top).toBeGreaterThan(bar.bottom - 10);
  });

  // A silent passage must still leave a visible hairline. Without the floor the
  // bar collapses to zero height and the card looks broken.
  it('gives silence a visible hairline instead of a zero-height bar', () => {
    for (const bar of waveBars(new Float32Array(400), 8)) {
      expect(bar.bottom - bar.top).toBeGreaterThanOrEqual(1);
    }
  });

  it('clamps out-of-range peaks inside the viewBox', () => {
    const [bar] = waveBars(new Float32Array([-1.5, 1.2]), 1);
    expect(bar.top).toBeGreaterThanOrEqual(0);
    expect(bar.bottom).toBeLessThanOrEqual(20);
  });

  // A track whose peaks failed to compute must still render a (flat) card
  // rather than crash the whole list.
  it('returns a full row of hairlines for empty peaks', () => {
    const bars = waveBars(new Float32Array(0), 4);
    expect(bars).toHaveLength(4);
    for (const bar of bars) expect(bar.bottom - bar.top).toBeGreaterThanOrEqual(1);
  });
});
