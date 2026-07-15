# Waveform inertia + marker snapping — design

**Date:** 2026-07-15
**Status:** approved (brainstorm), pending implementation plan

## Goal

Add momentum (inertia / fling) to the main waveform pan gesture, and magnetic
snapping to marker points when the gesture settles. All tuning parameters live
in a dedicated config file for future adjustment.

Reference implementation the user pointed at:
`restoplace-frontend/src/features/header-timeline/lib/physics.ts` +
`.../model/useTimeline.ts` (predicted-target fling + magnet presets).

## Decisions (locked)

- **Snap timing:** only on settle. Free inertia everywhere during the fling;
  the magnet engages only if the resting point lands within a threshold of a
  snap target, then eases exactly onto it. No hard-snap during the drag itself
  (markers are sparse — a forced grid would feel wrong).
- **Snap targets:** user markers (`store.markers[].time`) **plus** track start
  (`t = 0`) and track end (`t = duration`). Loop A/B is **not** a target.
- **Scope:** main waveform only (`WaveformCanvas` pan). The minimap keeps its
  existing relative-scrub reducer unchanged.
- **Bare tap near a marker** settles onto the marker (release with ~0 velocity
  inside the magnet zone → eased onto the nearest target). This is intended
  behaviour ("tap near a marker to snap to it"), not a SLOP no-op.

## Model

Predicted-target tween (ported from the reference `physics.ts`), operating in
**seconds** space rather than the reference's px-offset space. NOT per-frame
friction integration — at release we predict the resting point, adjust it onto
a snap target if within range, then ease to it. This keeps the physics pure and
testable and makes snapping a trivial target substitution.

The main waveform is a moving centered viewport: `position` (seconds) is the
source of truth and the wave scrolls under a fixed playhead. So "inertia" means
`position` keeps advancing after release with decay, driven by `store.seek()`.

## Components

### 1. Config — `src/waveform/inertiaConfig.ts`

Single flat `INERTIA_CONFIG` object (presets are a future extension; ship one
default). Keys:

| key                   | value | meaning |
|-----------------------|-------|---------|
| `velocityWindowMs`    | 100   | EMA window for release velocity |
| `velocityBufferSize`  | 8     | ring-buffer size for pointer samples |
| `flingTauMs`          | 280   | predicted rest = `position + vPos * tau` |
| `snapVelocity`        | 0.02  | px/ms — below this: no fling, snap direct |
| `flingDurationMinMs`  | 200   | fling tween duration lower clamp |
| `flingDurationMaxMs`  | 800   | fling tween duration upper clamp |
| `flingDurationFactor` | 1.5   | multiplier on `distance / abs(vPos)` |
| `snapThresholdPx`     | 24    | magnet radius in **screen px** |
| `snapEaseoutMs`       | 300   | short ease-out onto a target at ~0 velocity |
| `respectReducedMotion`| true  | skip the glide when reduced-motion is set |

**Magnet radius is stored in px, not seconds** — converted per-gesture via
`snapThresholdPx / pxPerSec` so the magnet feels identical at any zoom.

### 2. Pure physics — `src/waveform/inertia.ts` (unit-tested)

- `velocityFromSamples(samples, now, windowMs) → number` (px/ms) — EMA over
  fresh samples, ported ~1:1 from the reference `physics.ts`
  (`<2` fresh samples → `0`; recency-weighted).
- `snapTargets(markers, duration) → number[]` — marker times plus `0` and
  `duration`.
- `nearestSnapTarget(time, targets, thresholdSec) → number | null` — nearest
  target within the threshold, else `null`.
- `planFling({ position, velocityPx, pxPerSec, duration, targets, cfg }) →
  { target, durationMs }`:
  - `vPos = -velocityPx / pxPerSec` (finger right = back in time; sign matches
    the existing `panDeltaToTime`).
  - `rest = clamp(position + vPos * flingTauMs, 0, duration)`; if
    `|vPos| < snapVelocity` → `rest = position`.
  - `snap = nearestSnapTarget(rest, targets, snapThresholdPx / pxPerSec)`;
    `target = snap ?? rest`.
  - `durationMs = clamp(|target - position| / |vPos| * factor, min, max)`;
    when `|vPos|` is ~0 → `snapEaseoutMs`.
- `flingPositionAt(from, to, durationMs, elapsedMs) → { position, done }` —
  easeOutQuart interpolation; `done` once `elapsedMs >= durationMs`.

### 3. Adapter — `WaveformCanvas.tsx` gesture handler

Thin adapter (logic lives in the pure module, mirroring the minimap split):

- **pan phase:** in addition to the existing `seek`, push
  `{ x, t: performance.now() }` samples into a ring buffer.
- **release** (`touchend`, buffer held a pan): `velocityFromSamples` →
  `planFling` → start a **dedicated fling rAF** that each frame calls
  `flingPositionAt` → `store.seek(...)`; on `done` → resume playback if
  `wasPlaying`.
- **new `touchstart` during a fling:** cancel the fling rAF; `wasPlaying`
  carries into the new pan (playback is already paused).
- **`touchcancel` / pinch:** cancel the fling rAF; `wasPlaying` is not lost.
- **reduced motion:** skip the glide, `seek(target)` directly, then resume.
- **playback:** `wasPlaying` now spans pan → fling; resume happens on fling
  completion, not at `touchend`.

The fling rAF **never** calls `store.tick()` — only `seek()` — so the
"single ticker" rule (`WaveformCanvas` draw loop is the sole engine-clock
poller) is preserved. Two coexisting rAF loops is already the norm (the minimap
runs its own alongside the waveform).

### 4. Tests — `src/waveform/inertia.test.ts`

Pure module only:
- `velocityFromSamples`: empty / single sample → 0; recency-weighted EMA; stale
  samples filtered by window.
- `nearestSnapTarget`: inside zone, outside zone, empty markers, `0` and
  `duration` boundaries, ties.
- `planFling`: predicted rest, clamp to `[0, duration]`, target substitution
  when within range, skip-fling below `snapVelocity`, duration clamp
  `[min, max]`, ~0-velocity → `snapEaseoutMs`.
- `flingPositionAt`: endpoints (`elapsed=0 → from`, `elapsed>=dur → to, done`),
  monotonicity, easeOutQuart shape.

The canvas adapter stays device-verified (no unit tests), consistent with
`WaveformCanvas.tsx` today (see CLAUDE.md — jsdom has no real touch/canvas).

## Out of scope / untouched

- Minimap gesture (`minimapGesture.ts`) and its scrub feel.
- Pinch-zoom behaviour.
- Store public API (`seek`, `markers`, `position`, `pxPerSec` unchanged).
- Loop A/B as a snap target.

## Files

- `src/waveform/inertiaConfig.ts` — new (tunables).
- `src/waveform/inertia.ts` — new (pure physics).
- `src/waveform/inertia.test.ts` — new (unit tests).
- `src/waveform/WaveformCanvas.tsx` — edited (adapter wiring).
