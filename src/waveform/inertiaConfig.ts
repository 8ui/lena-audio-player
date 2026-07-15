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
