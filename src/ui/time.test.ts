import { describe, it, expect } from 'vitest';
import { fmtTime, fmtTimeTenths } from './time';

describe('fmtTime', () => {
  it('formats whole seconds as m:ss', () => {
    expect(fmtTime(42)).toBe('0:42');
    expect(fmtTime(65)).toBe('1:05');
  });

  it('floors a fractional second (no tenths)', () => {
    expect(fmtTime(42.9)).toBe('0:42');
  });
});

describe('fmtTimeTenths', () => {
  it('formats a whole second with a .0', () => {
    expect(fmtTimeTenths(42)).toBe('0:42.0');
  });

  it('keeps sub-second precision — the whole point of this formatter', () => {
    // A 0.5s loop and a 0.9s loop must not read the same, unlike fmtTime.
    expect(fmtTimeTenths(0.5)).toBe('0:00.5');
    expect(fmtTimeTenths(0.9)).toBe('0:00.9');
    expect(fmtTimeTenths(42.3)).toBe('0:42.3');
  });

  it('carries a tenths rollover into the seconds and minutes', () => {
    expect(fmtTimeTenths(59.95)).toBe('1:00.0');
    expect(fmtTimeTenths(65.05)).toBe('1:05.1');
  });

  it('is not tripped up by float noise on t - Math.floor(t)', () => {
    // 42.3 - 42 === 0.29999999999999996 in IEEE 754 — a naive
    // `Math.floor((t - whole) * 10)` would floor that down to .2.
    expect(42.3 - Math.floor(42.3)).not.toBe(0.3);
    expect(fmtTimeTenths(42.3)).toBe('0:42.3');
  });

  it('pads seconds under 10 the same way fmtTime does', () => {
    expect(fmtTimeTenths(65.1)).toBe('1:05.1');
  });
});
