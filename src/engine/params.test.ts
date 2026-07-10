import { describe, it, expect } from 'vitest';
import { clampTempo, clampSemitones, clamp } from './params';

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
