import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TrackWave, BARS } from './TrackWave';

// A 1-second 44.1kHz buffer -> 200 buckets, plenty to downsample to BARS.
const peaks = new Float32Array(400).fill(0.5);

describe('TrackWave', () => {
  afterEach(cleanup);

  it('draws one bar per column', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0} />);
    expect(container.querySelectorAll('rect')).toHaveLength(BARS);
  });

  it('marks no bar as played for a track that was never opened', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0} />);
    expect(container.querySelectorAll('rect.played')).toHaveLength(0);
  });

  // This is the whole point of the preview: the amber part is how far you got.
  it('marks the played fraction of the bars', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0.5} />);
    expect(container.querySelectorAll('rect.played')).toHaveLength(BARS / 2);
  });

  it('marks every bar as played at the end of the track', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={1} />);
    expect(container.querySelectorAll('rect.played')).toHaveLength(BARS);
  });

  // The wave is decoration next to the track's name — a screen reader must not
  // read out 48 rectangles.
  it('is hidden from assistive tech', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  // A silent passage must still leave a visible hairline. Without the MIN_HALF
  // floor these bars collapse to height 0 and the card looks broken.
  it('gives a silent passage a visible hairline instead of a zero-height bar', () => {
    const { container } = render(<TrackWave peaks={new Float32Array(400)} progress={0} />);
    const rects = [...container.querySelectorAll('rect')];
    expect(rects).toHaveLength(BARS);
    for (const r of rects) {
      expect(Number(r.getAttribute('height'))).toBeGreaterThan(0);
    }
  });
});
