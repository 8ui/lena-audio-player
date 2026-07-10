import { describe, it, expect } from 'vitest';
import { timeToX, xToTime, clampPxPerSec, panDeltaToTime } from './viewport';

describe('viewport', () => {
  it('places currentTime at center', () => {
    expect(timeToX(30, 30, 100, 1000)).toBeCloseTo(500);
  });
  it('offsets future time to the right', () => {
    expect(timeToX(31, 30, 100, 1000)).toBeCloseTo(600);
  });
  it('xToTime is inverse of timeToX', () => {
    const x = timeToX(42, 30, 137, 1000);
    expect(xToTime(x, 30, 137, 1000)).toBeCloseTo(42);
  });
  it('clamps zoom', () => {
    expect(clampPxPerSec(5)).toBe(20);
    expect(clampPxPerSec(9999)).toBe(400);
    expect(clampPxPerSec(100)).toBe(100);
  });
  it('drag right moves playback earlier (negative time delta)', () => {
    // dragging waveform right by 100px at 100px/s => -1s
    expect(panDeltaToTime(100, 100)).toBeCloseTo(-1);
  });
});
