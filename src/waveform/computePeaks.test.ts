import { describe, it, expect } from 'vitest';
import { computePeaks } from './computePeaks';

describe('computePeaks', () => {
  it('produces one min/max pair per bucket', () => {
    // 1000 samples, sampleRate 1000 => 1s. resolution 200/s => bucket 5 samples => 200 buckets.
    const ch = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) ch[i] = Math.sin(i);
    const peaks = computePeaks(ch, 1000, 200);
    expect(peaks.length).toBe(200 * 2);
  });
  it('captures min and max of a bucket', () => {
    const ch = new Float32Array([-0.5, 0.9, 0.1, 0.2, -0.3]);
    const peaks = computePeaks(ch, 5, 1); // 1 bucket of 5 samples
    expect(peaks[0]).toBeCloseTo(-0.5); // min
    expect(peaks[1]).toBeCloseTo(0.9);  // max
  });
  it('handles empty channel', () => {
    expect(computePeaks(new Float32Array(0), 44100, 200).length).toBe(0);
  });
});
