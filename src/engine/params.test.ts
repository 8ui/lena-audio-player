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

  // 0.75 - 0.1 and 0.35 - 0.1 don't actually pin the rounding: the former is
  // exactly 0.65 in IEEE-754 (no noise to round away), and the latter's noise
  // (0.35 - 0.1 === 0.24999999999999997) is masked by clampTempo's floor at
  // 0.25 regardless of rounding. Kept for coverage of those inputs, but the
  // two cases below are what actually fail if `Math.round` is removed:
  // 0.55 - 0.1 === 0.45000000000000007 and 0.44 - 0.1 === 0.33999999999999997.
  it('rounds away float noise', () => {
    expect(stepTempo(0.75, -1)).toBe(0.65);
    expect(stepTempo(0.35, -1)).toBe(0.25);
    expect(stepTempo(0.55, -1)).toBe(0.45);
    expect(stepTempo(0.44, -1)).toBe(0.34);
  });

  it('clamps at both ends and is idempotent there', () => {
    expect(stepTempo(1.5, 1)).toBe(1.5);
    expect(stepTempo(1.45, 1)).toBe(1.5);
    expect(stepTempo(0.25, -1)).toBe(0.25);
    expect(stepTempo(0.3, -1)).toBe(0.25);
  });
});
