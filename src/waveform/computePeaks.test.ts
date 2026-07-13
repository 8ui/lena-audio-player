import { describe, it, expect } from 'vitest';
import { computePeaks, downsamplePeaks } from './computePeaks';

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

// Float32Array stores single-precision, so -0.9 round-trips to -0.8999999761581421.
// Compare against Math.fround-ed expectations, not the raw literals.
const f32 = (vals: number[]) => vals.map((v) => Math.fround(v));

describe('downsamplePeaks', () => {
  it('reduces to exactly the requested number of columns', () => {
    const peaks = new Float32Array(200 * 2);
    expect(downsamplePeaks(peaks, 50).length).toBe(50 * 2);
  });

  it('keeps the min and max across each column span', () => {
    // 4 buckets -> 2 columns, each column spans 2 buckets.
    const peaks = new Float32Array([-0.1, 0.2, -0.9, 0.4, -0.2, 0.8, -0.3, 0.1]);
    expect(Array.from(downsamplePeaks(peaks, 2))).toEqual(f32([-0.9, 0.4, -0.3, 0.8]));
  });

  it('handles a span that does not divide evenly (5 buckets -> 2 columns)', () => {
    // spans: col0 = buckets [0,2), col1 = buckets [2,5)
    const peaks = new Float32Array([
      -0.1, 0.1, // b0
      -0.7, 0.2, // b1
      -0.2, 0.9, // b2
      -0.3, 0.4, // b3
      -0.5, 0.6, // b4
    ]);
    expect(Array.from(downsamplePeaks(peaks, 2))).toEqual(f32([-0.7, 0.2, -0.5, 0.9]));
  });

  it('duplicates buckets when there are fewer than columns (no empty columns)', () => {
    // 2 buckets -> 4 columns: cols 0,1 take bucket 0; cols 2,3 take bucket 1.
    const peaks = new Float32Array([-0.5, 0.5, -0.25, 0.25]);
    expect(Array.from(downsamplePeaks(peaks, 4))).toEqual(
      f32([-0.5, 0.5, -0.5, 0.5, -0.25, 0.25, -0.25, 0.25]),
    );
  });

  it('returns empty for empty peaks or non-positive columns', () => {
    expect(downsamplePeaks(new Float32Array(0), 10).length).toBe(0);
    expect(downsamplePeaks(new Float32Array([0, 1]), 0).length).toBe(0);
  });
});
