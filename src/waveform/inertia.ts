import type { InertiaConfig } from './inertiaConfig';

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

// The magnet targets: every user marker, plus the track start and end. Order
// does not matter — nearestSnapTarget scans all and picks the closest; harmless
// duplicates (a marker exactly at 0 or duration) are fine.
export function snapTargets(
  markers: readonly { time: number }[],
  duration: number,
): number[] {
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

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

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
