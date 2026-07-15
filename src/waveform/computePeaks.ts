export const PEAKS_RESOLUTION = 200; // buckets per second

export function computePeaks(
  channel: Float32Array,
  sampleRate: number,
  samplesPerSecond: number = PEAKS_RESOLUTION,
): Float32Array {
  if (channel.length === 0) return new Float32Array(0);
  const bucketSamples = Math.max(1, Math.round(sampleRate / samplesPerSecond));
  const buckets = Math.ceil(channel.length / bucketSamples);
  const out = new Float32Array(buckets * 2);
  for (let b = 0; b < buckets; b++) {
    const start = b * bucketSamples;
    const end = Math.min(start + bucketSamples, channel.length);
    let min = channel[start];
    let max = channel[start];
    for (let i = start + 1; i < end; i++) {
      const v = channel[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[b * 2] = min;
    out[b * 2 + 1] = max;
  }
  return out;
}

// Reduce the full-track peaks to one [min,max] pair per pixel column of the
// minimap. A full track holds PEAKS_RESOLUTION buckets/sec (tens of thousands
// for a few minutes), so the minimap must not walk them every frame — it
// downsamples once per (peaks, columns) and caches the result (see MiniMap.tsx).
export function downsamplePeaks(peaks: Float32Array, columns: number): Float32Array {
  const buckets = Math.floor(peaks.length / 2);
  if (buckets === 0 || columns <= 0) return new Float32Array(0);
  const out = new Float32Array(columns * 2);
  for (let c = 0; c < columns; c++) {
    // Column -> bucket span. `max(start + 1, …)` guarantees at least one bucket
    // per column, so a track with fewer buckets than columns fills every column
    // (buckets get duplicated) instead of leaving zeroed gaps.
    const start = Math.floor((c * buckets) / columns);
    const end = Math.max(start + 1, Math.floor(((c + 1) * buckets) / columns));
    let min = peaks[start * 2];
    let max = peaks[start * 2 + 1];
    for (let b = start + 1; b < end && b < buckets; b++) {
      const lo = peaks[b * 2];
      const hi = peaks[b * 2 + 1];
      if (lo < min) min = lo;
      if (hi > max) max = hi;
    }
    out[c * 2] = min;
    out[c * 2 + 1] = max;
  }
  return out;
}

// A card's waveform preview is ~48 bars, not a per-pixel trace: reuse the
// minimap's column reduction and collapse each [min,max] pair into a single
// 0..1 amplitude. Pure on purpose — the card renders SVG from this and owns no
// drawing logic of its own.
export function barHeights(peaks: Float32Array, bars: number): number[] {
  if (bars <= 0) return [];
  const cols = downsamplePeaks(peaks, bars);
  // downsamplePeaks returns an empty array when there are no buckets at all;
  // a flat row still has to render, so fall back to zeroes rather than [].
  if (cols.length === 0) return new Array(bars).fill(0);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const amp = Math.max(Math.abs(cols[i * 2]), Math.abs(cols[i * 2 + 1]));
    out.push(Math.min(1, amp));
  }
  return out;
}
