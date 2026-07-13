export const TEMPO_MIN = 0.25;
export const TEMPO_MAX = 1.5;
export const TEMPO_DEFAULT = 1;
export const SEMITONES_MIN = -12;
export const SEMITONES_MAX = 12;
export const TEMPO_STEP = 0.1;

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const clampTempo = (t: number): number => clamp(t, TEMPO_MIN, TEMPO_MAX);

export const clampSemitones = (n: number): number =>
  clamp(Math.round(n), SEMITONES_MIN, SEMITONES_MAX);

// Rounding is not cosmetic: stepping is applied repeatedly (each tap adds
// another +/- 0.1), and IEEE-754 noise accumulates across those additions —
// e.g. 0.55 - 0.1 is 0.45000000000000007, not 0.45 — and that value flows
// straight into the store, the engine and IndexedDB.
export const stepTempo = (t: number, dir: 1 | -1): number =>
  clampTempo(Math.round((t + dir * TEMPO_STEP) * 100) / 100);
