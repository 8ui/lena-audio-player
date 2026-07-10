export const TEMPO_MIN = 0.25;
export const TEMPO_MAX = 1.5;
export const TEMPO_DEFAULT = 1;
export const SEMITONES_MIN = -12;
export const SEMITONES_MAX = 12;

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const clampTempo = (t: number): number => clamp(t, TEMPO_MIN, TEMPO_MAX);

export const clampSemitones = (n: number): number =>
  clamp(Math.round(n), SEMITONES_MIN, SEMITONES_MAX);
