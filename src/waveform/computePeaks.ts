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
