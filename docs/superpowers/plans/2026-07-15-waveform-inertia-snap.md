# Waveform inertia + marker snapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add momentum (inertia) to the main waveform pan gesture and magnetic snapping to marker/start/end points when the gesture settles.

**Architecture:** A predicted-target tween model in seconds space (ported from `restoplace-frontend` `physics.ts`). At pointer release we predict the resting `position`, substitute a nearby snap target if within range, then ease onto it via a dedicated fling rAF that drives `store.seek()`. All physics is pure and unit-tested; `WaveformCanvas` is a thin adapter. All tunables live in one config file.

**Tech Stack:** React 19, TypeScript (tsgo), Vitest 4, Zustand 5, Web Audio. Single package.

## Global Constraints

- Type-check is separate from build: run `npx tsc --noEmit` explicitly; `vite build`/esbuild strips types.
- Test framework is Vitest 4; `vitest/globals` is in `tsconfig` types but tests here import from `'vitest'` explicitly for safety.
- Pure modules are the TDD surface; the canvas is device-verified only (jsdom has no real touch/canvas — see CLAUDE.md). No unit test for `WaveformCanvas`.
- Touch handlers on the canvas MUST use `e.targetTouches`, never `e.touches` (see CLAUDE.md), and MUST register `touchcancel` or a cancelled gesture strands playback paused.
- The fling rAF MUST call only `store.seek()`, never `store.tick()` — `WaveformCanvas`'s draw loop is the sole engine-clock ticker.
- `Marker` type is `{ time: number; label: string }` from `src/types`. Store exposes `position`, `duration`, `pxPerSec`, `playing`, `markers`, `seek(t)`, `togglePlay()`, `setPxPerSec(v)`.
- Sign convention: finger moves right (`clientX` grows) → `position` decreases (seek back). Matches existing `panDeltaToTime` and the current pan handler (`dt = -(x - lastX) / pxPerSec`).

---

### Task 1: Inertia config file

**Files:**
- Create: `src/waveform/inertiaConfig.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface InertiaConfig` and `const INERTIA_CONFIG: InertiaConfig` with keys `velocityWindowMs, velocityBufferSize, flingTauMs, snapVelocity, flingDurationMinMs, flingDurationMaxMs, flingDurationFactor, snapThresholdPx, snapEaseoutMs, respectReducedMotion`.

- [ ] **Step 1: Create the config file**

```ts
// src/waveform/inertiaConfig.ts

// All tunables for the waveform pan inertia + marker snapping, in one place for
// future adjustment. Predicted-target fling model (see docs/superpowers/specs/
// 2026-07-15-waveform-inertia-snap-design.md). A flat object, not presets —
// presets are a future extension if a settings UI ever needs them.
export interface InertiaConfig {
  /** EMA window for release velocity (ms). */
  velocityWindowMs: number;
  /** Ring-buffer size for pointer samples collected during the pan. */
  velocityBufferSize: number;
  /** Predicted rest = position + vPos * flingTauMs. */
  flingTauMs: number;
  /** px/ms — releases below this skip the fling and snap directly. */
  snapVelocity: number;
  /** Fling tween duration lower clamp (ms). */
  flingDurationMinMs: number;
  /** Fling tween duration upper clamp (ms). */
  flingDurationMaxMs: number;
  /** Multiplier on (distance / abs(vPos)) to derive the fling duration. */
  flingDurationFactor: number;
  /** Magnet radius in SCREEN px (converted to seconds via /pxPerSec at use). */
  snapThresholdPx: number;
  /** Short ease-out onto a target at ~0 release velocity (ms). */
  snapEaseoutMs: number;
  /** Skip the glide entirely when the OS prefers reduced motion. */
  respectReducedMotion: boolean;
}

export const INERTIA_CONFIG: InertiaConfig = {
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/waveform/inertiaConfig.ts
git commit -m "feat(waveform): inertia + snap tuning config"
```

---

### Task 2: velocityFromSamples

**Files:**
- Create: `src/waveform/inertia.ts`
- Test: `src/waveform/inertia.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface VelocitySample { x: number; t: number }` and `velocityFromSamples(samples: readonly VelocitySample[], now: number, windowMs: number): number` — px/ms, EMA over samples fresher than `now - windowMs`, `0` when fewer than 2 fresh samples.

- [ ] **Step 1: Write the failing test**

```ts
// src/waveform/inertia.test.ts
import { describe, it, expect } from 'vitest';
import { velocityFromSamples } from './inertia';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/waveform/inertia.test.ts`
Expected: FAIL — cannot resolve `./inertia` / `velocityFromSamples is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/waveform/inertia.ts

export interface VelocitySample {
  /** clientX (px). */
  x: number;
  /** performance.now() timestamp (ms). */
  t: number;
}

// EMA velocity (px/ms) over the last `windowMs` of pointer samples. Ported from
// restoplace-frontend physics.ts: samples older than now-windowMs are dropped
// (guards slow-drag-then-flick), <2 fresh samples returns 0, and pairs are
// recency-weighted (latest pair weight 1, prior 0.5, ...). Positive = +X.
export function velocityFromSamples(
  samples: readonly VelocitySample[],
  now: number,
  windowMs: number,
): number {
  const cutoff = now - windowMs;
  const fresh = samples.filter((s) => s.t >= cutoff);
  if (fresh.length < 2) return 0;

  let weightedSum = 0;
  let weightTotal = 0;
  const last = fresh.length - 1;
  for (let i = 1; i < fresh.length; i++) {
    const dx = fresh[i].x - fresh[i - 1].x;
    const dt = fresh[i].t - fresh[i - 1].t;
    if (dt <= 0) continue;
    const v = dx / dt;
    const weight = Math.pow(2, i - last);
    weightedSum += v * weight;
    weightTotal += weight;
  }
  return weightTotal === 0 ? 0 : weightedSum / weightTotal;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/waveform/inertia.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/waveform/inertia.ts src/waveform/inertia.test.ts
git commit -m "feat(waveform): velocityFromSamples (EMA release velocity)"
```

---

### Task 3: snapTargets + nearestSnapTarget

**Files:**
- Modify: `src/waveform/inertia.ts`
- Test: `src/waveform/inertia.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `snapTargets(markers: readonly Marker[], duration: number): number[]` — marker times plus `0`, plus `duration` when `duration > 0`.
  - `nearestSnapTarget(time: number, targets: readonly number[], thresholdSec: number): number | null` — nearest target within `thresholdSec`, else `null`.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/waveform/inertia.test.ts
import { snapTargets, nearestSnapTarget } from './inertia';

describe('snapTargets', () => {
  it('includes marker times plus 0 and duration', () => {
    const t = snapTargets([{ time: 5, label: '1' }, { time: 30, label: '2' }], 100);
    expect(t).toEqual([5, 30, 0, 100]);
  });

  it('omits duration when it is 0', () => {
    expect(snapTargets([{ time: 5, label: '1' }], 0)).toEqual([5, 0]);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/waveform/inertia.test.ts`
Expected: FAIL — `snapTargets`/`nearestSnapTarget` is not a function.

- [ ] **Step 3: Write minimal implementation**

```ts
// add to src/waveform/inertia.ts
import type { Marker } from '../types';

// The magnet targets: every user marker, plus the track start and end. Order
// does not matter — nearestSnapTarget scans all and picks the closest; harmless
// duplicates (a marker exactly at 0 or duration) are fine.
export function snapTargets(markers: readonly Marker[], duration: number): number[] {
  const targets = markers.map((m) => m.time);
  targets.push(0);
  if (duration > 0) targets.push(duration);
  return targets;
}

// Nearest target within `thresholdSec` of `time`, or null when none qualifies.
export function nearestSnapTarget(
  time: number,
  targets: readonly number[],
  thresholdSec: number,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const d = Math.abs(t - time);
    if (d <= thresholdSec && d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/waveform/inertia.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/waveform/inertia.ts src/waveform/inertia.test.ts
git commit -m "feat(waveform): snap targets (markers + track start/end)"
```

---

### Task 4: planFling

**Files:**
- Modify: `src/waveform/inertia.ts`
- Test: `src/waveform/inertia.test.ts`

**Interfaces:**
- Consumes: `nearestSnapTarget` (Task 3), `InertiaConfig` (Task 1).
- Produces:
  - `interface FlingInput { position: number; velocityPx: number; pxPerSec: number; duration: number; targets: readonly number[]; cfg: InertiaConfig }`
  - `interface FlingPlan { target: number; durationMs: number }`
  - `planFling(input: FlingInput): FlingPlan`

- [ ] **Step 1: Write the failing test**

```ts
// append to src/waveform/inertia.test.ts
import { planFling } from './inertia';
import type { InertiaConfig } from './inertiaConfig';

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

  it('clamps a huge fling duration to the max', () => {
    const plan = planFling({
      position: 0, velocityPx: -0.03, pxPerSec: 100, duration: 100000,
      targets: [], cfg: CFG,
    });
    // vPos 0.0003 -> distance ~0.084 -> /0.0003 = 280 *1.5 = 420... ensure clamp path
    // use a tiny velocity just above threshold to force a long duration:
    const plan2 = planFling({
      position: 0, velocityPx: -0.021, pxPerSec: 1, duration: 100000,
      targets: [], cfg: CFG,
    });
    expect(plan2.durationMs).toBe(CFG.flingDurationMaxMs);
    expect(plan.durationMs).toBeGreaterThanOrEqual(CFG.flingDurationMinMs);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/waveform/inertia.test.ts`
Expected: FAIL — `planFling is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// add to src/waveform/inertia.ts
import type { InertiaConfig } from './inertiaConfig';

export interface FlingInput {
  position: number;
  /** Release velocity from velocityFromSamples (px/ms). */
  velocityPx: number;
  pxPerSec: number;
  duration: number;
  targets: readonly number[];
  cfg: InertiaConfig;
}

export interface FlingPlan {
  /** Where the glide settles (seconds). */
  target: number;
  /** Ease-out duration (ms). */
  durationMs: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

// Predicted-target fling: project the resting position, substitute a nearby
// snap target if one is within the magnet zone, then compute an ease-out
// duration proportional to the distance actually travelled. Below snapVelocity
// there is no glide — rest = position and we only run the short doovodchik onto
// a nearby target (snapEaseoutMs).
export function planFling({
  position,
  velocityPx,
  pxPerSec,
  duration,
  targets,
  cfg,
}: FlingInput): FlingPlan {
  // Finger right (+X) => back in time: negate. Guard pxPerSec = 0.
  const vPos = pxPerSec > 0 ? -velocityPx / pxPerSec : 0; // seconds per ms
  const slow = Math.abs(velocityPx) < cfg.snapVelocity;

  const rest = slow
    ? position
    : clamp(position + vPos * cfg.flingTauMs, 0, duration);

  const thresholdSec = pxPerSec > 0 ? cfg.snapThresholdPx / pxPerSec : 0;
  const snap = nearestSnapTarget(rest, targets, thresholdSec);
  const target = snap ?? rest;

  const distance = Math.abs(target - position);
  const durationMs = slow
    ? cfg.snapEaseoutMs
    : clamp(
        (distance / Math.abs(vPos)) * cfg.flingDurationFactor,
        cfg.flingDurationMinMs,
        cfg.flingDurationMaxMs,
      );

  return { target, durationMs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/waveform/inertia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/waveform/inertia.ts src/waveform/inertia.test.ts
git commit -m "feat(waveform): planFling (predicted-target + snap substitution)"
```

---

### Task 5: easeOutQuart + flingPositionAt

**Files:**
- Modify: `src/waveform/inertia.ts`
- Test: `src/waveform/inertia.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `easeOutQuart(t: number): number` — eased `[0,1] → [0,1]`, input clamped.
  - `flingPositionAt(from: number, to: number, durationMs: number, elapsedMs: number): { position: number; done: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/waveform/inertia.test.ts
import { easeOutQuart, flingPositionAt } from './inertia';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/waveform/inertia.test.ts`
Expected: FAIL — `easeOutQuart`/`flingPositionAt` is not a function.

- [ ] **Step 3: Write minimal implementation**

```ts
// add to src/waveform/inertia.ts
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function easeOutQuart(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 4);
}

// Sample the eased position at `elapsedMs` of a `durationMs` glide from `from`
// to `to`. `done` is true once the glide has fully elapsed (or duration <= 0).
export function flingPositionAt(
  from: number,
  to: number,
  durationMs: number,
  elapsedMs: number,
): { position: number; done: boolean } {
  if (durationMs <= 0) return { position: to, done: true };
  const raw = elapsedMs / durationMs;
  const done = raw >= 1;
  const eased = easeOutQuart(done ? 1 : raw);
  return { position: from + (to - from) * eased, done };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/waveform/inertia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/waveform/inertia.ts src/waveform/inertia.test.ts
git commit -m "feat(waveform): easeOutQuart + flingPositionAt sampler"
```

---

### Task 6: Wire inertia + snap into WaveformCanvas

**Files:**
- Modify: `src/waveform/WaveformCanvas.tsx` (imports + the gesture `useEffect`, currently lines 100-167)

**Interfaces:**
- Consumes: `INERTIA_CONFIG` (Task 1); `velocityFromSamples`, `VelocitySample`, `snapTargets`, `planFling`, `flingPositionAt` (Tasks 2-5); existing store `seek`, `togglePlay`, `setPxPerSec`, `position`, `duration`, `pxPerSec`, `playing`, `markers`; `clampPxPerSec` (already imported).
- Produces: nothing consumed by later tasks (terminal integration task).

This task has no unit test — the canvas gesture path is device-verified only (jsdom has no touch/canvas; see CLAUDE.md). Verification is `tsc` + full test suite still green + build + a manual device check.

- [ ] **Step 1: Add the new imports**

At the top of `src/waveform/WaveformCanvas.tsx`, below the existing `import { activePalette } from '../ui/theme';` line, add:

```ts
import { INERTIA_CONFIG } from './inertiaConfig';
import {
  velocityFromSamples,
  snapTargets,
  planFling,
  flingPositionAt,
  type VelocitySample,
} from './inertia';
```

- [ ] **Step 2: Replace the gesture `useEffect`**

Replace the entire second `useEffect` (the `// gestures` block, currently lines 100-167 ending at its `}, [store]);`) with:

```tsx
  // gestures
  useEffect(() => {
    const canvas = canvasRef.current!;
    let mode: 'none' | 'pan' | 'pinch' = 'none';
    let lastX = 0;
    let pinchStartDist = 0;
    let pinchStartPx = 100;
    // wasPlaying spans the whole pan -> fling handoff: playback is paused for
    // the gesture and resumed only when the glide settles, not at touchend.
    let wasPlaying = false;

    // Velocity ring buffer, fed on every pan move; read once at release.
    const samples: VelocitySample[] = [];
    const pushSample = (x: number) => {
      samples.push({ x, t: performance.now() });
      if (samples.length > INERTIA_CONFIG.velocityBufferSize) samples.shift();
    };

    // Dedicated fling rAF. It only ever calls store.seek() — NEVER store.tick()
    // — so WaveformCanvas's draw loop stays the sole engine-clock ticker.
    let flingRaf = 0;
    const cancelFling = () => {
      if (flingRaf) {
        cancelAnimationFrame(flingRaf);
        flingRaf = 0;
      }
    };

    const reducedMotion =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Resume playback (if it was playing) and clear the pause flag. Called at
    // the end of every settle path.
    const finishGesture = () => {
      cancelFling();
      if (wasPlaying) store.getState().togglePlay();
      wasPlaying = false;
    };

    const startFling = () => {
      const s = store.getState();
      const velocityPx = velocityFromSamples(
        samples,
        performance.now(),
        INERTIA_CONFIG.velocityWindowMs,
      );
      const from = s.position;
      const plan = planFling({
        position: from,
        velocityPx,
        pxPerSec: s.pxPerSec,
        duration: s.duration,
        targets: snapTargets(s.markers, s.duration),
        cfg: INERTIA_CONFIG,
      });

      if (
        (INERTIA_CONFIG.respectReducedMotion && reducedMotion) ||
        plan.durationMs <= 0
      ) {
        store.getState().seek(plan.target);
        finishGesture();
        return;
      }

      const startT = performance.now();
      const step = () => {
        const { position, done } = flingPositionAt(
          from,
          plan.target,
          plan.durationMs,
          performance.now() - startT,
        );
        store.getState().seek(position);
        if (done) {
          finishGesture();
          return;
        }
        flingRaf = requestAnimationFrame(step);
      };
      flingRaf = requestAnimationFrame(step);
    };

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    // e.targetTouches, NEVER e.touches (see CLAUDE.md): a finger resting on the
    // sibling MiniMap plus a finger here would make touches.length === 2 and
    // silently enter pinch-zoom.
    const onStart = (e: TouchEvent) => {
      const s = store.getState();
      if (e.targetTouches.length === 1 && mode === 'none') {
        // A touch landing mid-fling adopts the in-progress pause: cancel the
        // glide but keep wasPlaying so the next release still resumes.
        const flinging = flingRaf !== 0;
        cancelFling();
        mode = 'pan';
        lastX = e.targetTouches[0].clientX;
        samples.length = 0;
        pushSample(lastX);
        if (!flinging) {
          wasPlaying = s.playing;
          if (wasPlaying) s.togglePlay();
        }
      } else if (e.targetTouches.length === 2) {
        // Cancel any fling; wasPlaying persists and resumes on the pinch's
        // touchend chain.
        cancelFling();
        mode = 'pinch';
        pinchStartDist = Math.max(1, dist(e.targetTouches));
        pinchStartPx = s.pxPerSec;
      }
    };

    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const s = store.getState();
      if (mode === 'pan' && e.targetTouches.length === 1) {
        const x = e.targetTouches[0].clientX;
        const dt = -(x - lastX) / s.pxPerSec;
        lastX = x;
        pushSample(x);
        s.seek(Math.max(0, Math.min(s.position + dt, s.duration)));
      } else if (mode === 'pinch' && e.targetTouches.length === 2) {
        const factor = dist(e.targetTouches) / pinchStartDist;
        s.setPxPerSec(clampPxPerSec(pinchStartPx * factor));
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.targetTouches.length === 0) {
        if (mode === 'pan') {
          // Hand the pan off to the glide; it resumes playback when it settles.
          mode = 'none';
          startFling();
        } else {
          // Pinch (or idle) ended: resume directly.
          mode = 'none';
          if (wasPlaying) {
            store.getState().togglePlay();
            wasPlaying = false;
          }
        }
      } else if (e.targetTouches.length === 1 && mode === 'pinch') {
        // Lifting one of two fingers drops back to pan: start a fresh velocity
        // trace from here so the eventual release flings correctly.
        mode = 'pan';
        lastX = e.targetTouches[0].clientX;
        samples.length = 0;
        pushSample(lastX);
      }
    };

    // Without touchcancel a cancelled gesture strands playback paused forever
    // (see CLAUDE.md). Cancel settles immediately — no fling on an aborted
    // gesture — and resumes playback if it was playing.
    const onCancel = () => {
      cancelFling();
      mode = 'none';
      samples.length = 0;
      if (wasPlaying) {
        store.getState().togglePlay();
        wasPlaying = false;
      }
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onCancel);
    return () => {
      cancelFling();
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onCancel);
    };
  }, [store]);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 4: Run the full test suite (nothing regressed)**

Run: `npm test`
Expected: PASS — previous 186 tests plus the new `inertia.test.ts` cases, all green.

- [ ] **Step 5: Production build (esbuild catches nothing tsc missed; sanity)**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual device check (device-only — jsdom cannot cover this)**

On a real touch device (or the deployed site / dev server over touch):
1. Import a track, add a couple of markers.
2. Flick the waveform: it keeps gliding and decelerates (inertia).
3. Let a flick settle near a marker / the track start / end: it eases exactly onto the point.
4. Flick to open space (no target near): it settles wherever momentum stops.
5. Verify playback that was running pauses during the gesture and resumes only after the glide settles.
6. Start a new touch mid-glide: the glide cancels and the new pan takes over; releasing it resumes playback correctly (no stuck-paused, no double-resume).
7. Pinch-zoom still zooms; a finger on the minimap does not trigger pinch here.

- [ ] **Step 7: Commit**

```bash
git add src/waveform/WaveformCanvas.tsx
git commit -m "feat(waveform): inertia + marker snapping on pan release"
```

---

## Self-Review

**Spec coverage:**
- Config file with all tunables → Task 1. ✅
- `velocityFromSamples` → Task 2. ✅
- `snapTargets` (markers + start/end) + `nearestSnapTarget` → Task 3. ✅
- `planFling` (predicted rest, clamp, snap substitution, skip-fling, duration clamp) → Task 4. ✅
- `flingPositionAt` + `easeOutQuart` → Task 5. ✅
- Adapter: pan velocity sampling, release → fling rAF driving `seek`, resume-on-settle, mid-fling re-touch, touchcancel, reduced-motion, pinch untouched → Task 6. ✅
- Snap only on settle (no drag-phase magnet) → Task 6 onMove is unchanged 1:1 pan; magnet only in `planFling`. ✅
- Bare-tap-near-marker settles onto it → Task 4 slow branch + Task 6 always calls `startFling` on pan release. ✅
- Loop A/B NOT a target → `snapTargets` omits it. ✅
- Minimap untouched, store API untouched → no tasks modify them. ✅

**Placeholder scan:** none — every code/test step is complete.

**Type consistency:** `InertiaConfig`, `VelocitySample`, `FlingInput`/`FlingPlan`, and the function names (`velocityFromSamples`, `snapTargets`, `nearestSnapTarget`, `planFling`, `easeOutQuart`, `flingPositionAt`) are used identically across tasks and in Task 6's imports. `Marker` = `{ time, label }` matches `src/types`. ✅
