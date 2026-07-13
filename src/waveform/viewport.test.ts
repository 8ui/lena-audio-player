import { describe, it, expect } from 'vitest';
import {
  timeToX,
  xToTime,
  clampPxPerSec,
  panDeltaToTime,
  overviewTimeToX,
  overviewDragToTime,
} from './viewport';

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

describe('overview viewport (minimap)', () => {
  it('maps time linearly across the full width', () => {
    expect(overviewTimeToX(0, 100, 400)).toBeCloseTo(0);
    expect(overviewTimeToX(50, 100, 400)).toBeCloseTo(200);
    expect(overviewTimeToX(100, 100, 400)).toBeCloseTo(400);
  });

  it('is safe when duration is zero', () => {
    expect(overviewTimeToX(10, 0, 400)).toBe(0);
  });
});

describe('overviewDragToTime (relative minimap scrub)', () => {
  it('does not move at all when the finger has not moved', () => {
    expect(overviewDragToTime(42, 0, 100, 400)).toBe(42);
  });

  it('dragging right moves forward through the track', () => {
    // +100px of a 400px strip = a quarter of a 100s track = +25s
    expect(overviewDragToTime(10, 100, 100, 400)).toBeCloseTo(35);
  });

  it('dragging left moves backward through the track', () => {
    expect(overviewDragToTime(50, -100, 100, 400)).toBeCloseTo(25);
  });

  it('clamps to 0..duration', () => {
    expect(overviewDragToTime(10, -9999, 100, 400)).toBe(0);
    expect(overviewDragToTime(90, 9999, 100, 400)).toBe(100);
  });

  it('falls back to the start position on degenerate width/duration', () => {
    // A relative mapper must NOT collapse to 0 here: the caller seeks to the
    // result unconditionally, so returning 0 would yank the playhead to the
    // start of the track. Standing still is the safe no-op.
    expect(overviewDragToTime(10, 50, 0, 400)).toBe(10);
    expect(overviewDragToTime(10, 50, 100, 0)).toBe(10);
  });
});
