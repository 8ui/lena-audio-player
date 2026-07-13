import { describe, it, expect } from 'vitest';
import {
  timeToX,
  xToTime,
  clampPxPerSec,
  panDeltaToTime,
  overviewTimeToX,
  overviewXToTime,
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

  it('overviewXToTime is the inverse of overviewTimeToX', () => {
    const x = overviewTimeToX(37, 100, 400);
    expect(overviewXToTime(x, 100, 400)).toBeCloseTo(37);
  });

  it('overviewXToTime clamps to 0..duration', () => {
    expect(overviewXToTime(-50, 100, 400)).toBe(0);
    expect(overviewXToTime(9999, 100, 400)).toBe(100);
  });

  it('is safe when duration or width is zero', () => {
    expect(overviewTimeToX(10, 0, 400)).toBe(0);
    expect(overviewXToTime(200, 100, 0)).toBe(0);
  });
});
