import { describe, it, expect } from 'vitest';
import {
  velocityFromSamples,
  snapTargets,
  nearestSnapTarget,
  planFling,
  easeOutQuart,
  flingPositionAt,
} from './inertia';
import type { InertiaConfig } from './inertiaConfig';

describe('velocityFromSamples', () => {
  it('returns 0 for fewer than 2 fresh samples', () => {
    expect(velocityFromSamples([], 0, 100)).toBe(0);
    expect(velocityFromSamples([{ x: 5, t: 0 }], 0, 100)).toBe(0);
  });

  it('computes constant velocity (px/ms) with sign', () => {
    const s = [
      { x: 0, t: 0 },
      { x: 10, t: 10 },
      { x: 20, t: 20 },
    ];
    expect(velocityFromSamples(s, 20, 100)).toBeCloseTo(1, 5);
    const back = [
      { x: 20, t: 0 },
      { x: 10, t: 10 },
      { x: 0, t: 20 },
    ];
    expect(velocityFromSamples(back, 20, 100)).toBeCloseTo(-1, 5);
  });

  it('drops samples older than the window (slow-drag-then-flick)', () => {
    const s = [
      { x: 0, t: 0 }, // stale: 0 < 200 - 100
      { x: 0, t: 150 },
      { x: 10, t: 160 },
    ];
    // only the two fresh samples count: 10px / 10ms = 1
    expect(velocityFromSamples(s, 200, 100)).toBeCloseTo(1, 5);
  });
});

describe('snapTargets', () => {
  it('includes marker times plus 0 and duration', () => {
    const t = snapTargets([{ time: 5 }, { time: 30 }], 100);
    expect(t).toEqual([5, 30, 0, 100]);
  });

  it('omits duration when it is 0', () => {
    expect(snapTargets([{ time: 5 }], 0)).toEqual([5, 0]);
  });

  it('has just the endpoints when there are no markers', () => {
    expect(snapTargets([], 100)).toEqual([0, 100]);
  });
});

describe('nearestSnapTarget', () => {
  const targets = [0, 5, 10, 100];

  it('returns the nearest target inside the threshold', () => {
    expect(nearestSnapTarget(10.1, targets, 0.3)).toBe(10);
  });

  it('returns null when nothing is inside the threshold', () => {
    expect(nearestSnapTarget(10.5, targets, 0.3)).toBeNull();
  });

  it('snaps to the start/end endpoints', () => {
    expect(nearestSnapTarget(0.1, targets, 0.2)).toBe(0);
    expect(nearestSnapTarget(99.95, targets, 0.2)).toBe(100);
  });

  it('returns null for empty targets', () => {
    expect(nearestSnapTarget(10, [], 5)).toBeNull();
  });
});

const CFG: InertiaConfig = {
  velocityWindowMs: 100,
  velocityBufferSize: 8,
  flingTauMs: 280,
  snapVelocity: 0.02,
  flingDurationMinMs: 200,
  flingDurationMaxMs: 800,
  flingDurationFactor: 1.5,
  snapThresholdPx: 24,
  snapEaseoutMs: 300,
  respectReducedMotion: true,
};

describe('planFling', () => {
  it('projects a forward glide (finger left = later)', () => {
    // finger moving left: velocityPx negative -> vPos positive -> position grows
    const plan = planFling({
      position: 10, velocityPx: -1, pxPerSec: 100, duration: 1000,
      targets: [], cfg: CFG,
    });
    // rest = 10 + (1/100)*280 = 12.8 ; no targets -> target = rest
    expect(plan.target).toBeCloseTo(12.8, 5);
    // distance 2.8 / vPos 0.01 = 280 * 1.5 = 420 (within [200,800])
    expect(plan.durationMs).toBeCloseTo(420, 5);
  });

  it('clamps the rest to [0, duration] and snaps to the end', () => {
    const plan = planFling({
      position: 99, velocityPx: -5, pxPerSec: 100, duration: 100,
      targets: [0, 100], cfg: CFG,
    });
    // rest clamps to 100, which is a target within threshold -> target 100
    expect(plan.target).toBe(100);
  });

  it('substitutes a nearby marker for the raw rest', () => {
    // rest = 10 + 0.01*280 = 12.8 ; marker at 12.9, threshold 24/100 = 0.24
    const plan = planFling({
      position: 10, velocityPx: -1, pxPerSec: 100, duration: 1000,
      targets: [12.9], cfg: CFG,
    });
    expect(plan.target).toBe(12.9);
  });

  it('skips the fling below snapVelocity and uses snapEaseoutMs', () => {
    // velocityPx 0.005 < snapVelocity 0.02 -> rest = position
    const plan = planFling({
      position: 10, velocityPx: 0.005, pxPerSec: 100, duration: 1000,
      targets: [10.1], cfg: CFG, // marker within 0.24 of position
    });
    expect(plan.target).toBe(10.1);
    expect(plan.durationMs).toBe(300);
  });

  it('clamps a far snap-extended glide to the max duration', () => {
    // pxPerSec 1: vPos 0.021, rest = 5.88; a marker 19s past rest is still
    // within threshold (24s at pxPerSec 1) -> distance ~25 / 0.021 huge -> 800.
    const plan = planFling({
      position: 0, velocityPx: -0.021, pxPerSec: 1, duration: 1000,
      targets: [25], cfg: CFG,
    });
    expect(plan.target).toBe(25);
    expect(plan.durationMs).toBe(CFG.flingDurationMaxMs);
  });

  it('clamps a near snap-shortened glide to the min duration', () => {
    // same velocity, but the nearby target pulls the glide back to distance 1
    // -> 1 / 0.021 * 1.5 = 71 -> clamps up to 200.
    const plan = planFling({
      position: 0, velocityPx: -0.021, pxPerSec: 1, duration: 1000,
      targets: [1], cfg: CFG,
    });
    expect(plan.target).toBe(1);
    expect(plan.durationMs).toBe(CFG.flingDurationMinMs);
  });
});

describe('easeOutQuart', () => {
  it('pins the endpoints', () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
  });
  it('is front-loaded (fast then slow)', () => {
    expect(easeOutQuart(0.5)).toBeCloseTo(0.9375, 5); // 1 - 0.5^4
  });
});

describe('flingPositionAt', () => {
  it('starts at from, not done', () => {
    expect(flingPositionAt(0, 10, 100, 0)).toEqual({ position: 0, done: false });
  });
  it('finishes exactly at to once elapsed >= duration', () => {
    expect(flingPositionAt(0, 10, 100, 100)).toEqual({ position: 10, done: true });
    expect(flingPositionAt(0, 10, 100, 250)).toEqual({ position: 10, done: true });
  });
  it('eases in between', () => {
    const { position, done } = flingPositionAt(0, 10, 100, 50);
    expect(done).toBe(false);
    expect(position).toBeCloseTo(9.375, 5);
  });
  it('is a no-op for zero/negative duration', () => {
    expect(flingPositionAt(3, 7, 0, 0)).toEqual({ position: 7, done: true });
  });
});
