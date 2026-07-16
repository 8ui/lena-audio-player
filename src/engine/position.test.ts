import { describe, it, expect } from 'vitest';
import { currentSourceTime, clampIntoLoop } from './position';

const base = { startOffset: 0, tempo: 1, duration: 100, loopStart: null, loopEnd: null };

describe('currentSourceTime', () => {
  it('advances linearly with elapsed at tempo 1', () => {
    expect(currentSourceTime({ ...base, elapsed: 10 }).time).toBeCloseTo(10);
  });
  it('scales advance by tempo', () => {
    expect(currentSourceTime({ ...base, elapsed: 10, tempo: 0.5 }).time).toBeCloseTo(5);
  });
  it('respects startOffset', () => {
    expect(currentSourceTime({ ...base, startOffset: 20, elapsed: 5 }).time).toBeCloseTo(25);
  });
  it('clamps to duration and reports ended when past end without loop', () => {
    const r = currentSourceTime({ ...base, elapsed: 200 });
    expect(r.time).toBeCloseTo(100);
    expect(r.ended).toBe(true);
  });
  it('wraps inside loop region', () => {
    // loop [10,20], start at 10, elapsed 25 => raw 35 => (35-10)%10=5 => 15
    const r = currentSourceTime({
      ...base, startOffset: 10, elapsed: 25, loopStart: 10, loopEnd: 20,
    });
    expect(r.time).toBeCloseTo(15);
    expect(r.ended).toBe(false);
  });
  it('does not end while looping past duration boundary', () => {
    const r = currentSourceTime({
      ...base, startOffset: 90, elapsed: 30, loopStart: 90, loopEnd: 95,
    });
    expect(r.ended).toBe(false);
    expect(r.time).toBeGreaterThanOrEqual(90);
    expect(r.time).toBeLessThan(95);
  });
});

describe('clampIntoLoop', () => {
  it('snaps a target before the loop to loopStart', () => {
    expect(clampIntoLoop(5, 20, 40)).toBe(20);
  });
  it('snaps a target after the loop to loopEnd', () => {
    expect(clampIntoLoop(50, 20, 40)).toBe(40);
  });
  it('leaves a target inside the loop unchanged', () => {
    expect(clampIntoLoop(30, 20, 40)).toBe(30);
  });
  it('is a no-op when there is no loop', () => {
    expect(clampIntoLoop(5, null, null)).toBe(5);
  });
  it('is a no-op for a degenerate loop (end <= start)', () => {
    expect(clampIntoLoop(5, 40, 40)).toBe(5);
    expect(clampIntoLoop(5, 40, 20)).toBe(5);
  });
});
