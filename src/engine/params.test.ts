import { describe, it, expect } from 'vitest';
import { clampTempo, clampSemitones, clamp, TEMPO_STEP, stepTempo } from './params';

describe('params', () => {
  it('clamps generic values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it('clamps tempo to 0.25..1.5', () => {
    expect(clampTempo(0.1)).toBe(0.25);
    expect(clampTempo(2)).toBe(1.5);
    expect(clampTempo(0.8)).toBe(0.8);
  });
  it('clamps and rounds semitones to -12..12 integers', () => {
    expect(clampSemitones(13)).toBe(12);
    expect(clampSemitones(-20)).toBe(-12);
    expect(clampSemitones(2.4)).toBe(2);
  });
});

describe('stepTempo', () => {
  it('steps up and down by TEMPO_STEP', () => {
    expect(TEMPO_STEP).toBe(0.1);
    expect(stepTempo(1, -1)).toBe(0.9);
    expect(stepTempo(0.9, 1)).toBe(1);
  });

  // 0.75 - 0.1 === 0.6499999999999999 in IEEE-754. Without rounding the UI
  // would show 0.65× once and 0.64× after a round-trip through the store.
  it('rounds away float noise', () => {
    expect(stepTempo(0.75, -1)).toBe(0.65);
    expect(stepTempo(0.35, -1)).toBe(0.25);
  });

  it('clamps at both ends and is idempotent there', () => {
    expect(stepTempo(1.5, 1)).toBe(1.5);
    expect(stepTempo(1.45, 1)).toBe(1.5);
    expect(stepTempo(0.25, -1)).toBe(0.25);
    expect(stepTempo(0.3, -1)).toBe(0.25);
  });
});
