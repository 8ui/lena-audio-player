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
