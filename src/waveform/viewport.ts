export const PX_PER_SEC_MIN = 20;
export const PX_PER_SEC_MAX = 400;
export const PX_PER_SEC_DEFAULT = 100;

export const timeToX = (t: number, currentTime: number, pxPerSec: number, width: number): number =>
  width / 2 + (t - currentTime) * pxPerSec;

export const xToTime = (x: number, currentTime: number, pxPerSec: number, width: number): number =>
  currentTime + (x - width / 2) / pxPerSec;

export const clampPxPerSec = (v: number): number =>
  Math.min(PX_PER_SEC_MAX, Math.max(PX_PER_SEC_MIN, v));

// Drag waveform right (+deltaX) => scroll back in time (earlier).
export const panDeltaToTime = (deltaXpx: number, pxPerSec: number): number =>
  -deltaXpx / pxPerSec;

// Minimap mapping: the WHOLE track spans the strip width (as opposed to
// timeToX/xToTime above, which centre a zoomed window on the playhead).
export const overviewTimeToX = (t: number, duration: number, width: number): number =>
  duration > 0 ? (t / duration) * width : 0;

// Relative scrub on the minimap: the playhead does NOT jump to where you tap
// (on a 48px strip a 3mm miss is ~20s — you lose your place). It stays put and
// then moves BY the finger's delta, mapped onto the whole track. Finger right
// => later (the cursor follows the finger; the strip is static, unlike the main
// waveform where the wave itself is dragged).
//
// On a degenerate width/duration this returns startTime, NOT 0 — the caller
// seeks to the result unconditionally, and 0 would mean "jump to the start".
export const overviewDragToTime = (
  startTime: number,
  deltaXpx: number,
  duration: number,
  width: number,
): number => {
  if (width <= 0 || duration <= 0) return startTime;
  return Math.min(duration, Math.max(0, startTime + (deltaXpx / width) * duration));
};
