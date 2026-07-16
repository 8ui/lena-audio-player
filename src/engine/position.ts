export interface PositionParams {
  startOffset: number;
  elapsed: number;
  tempo: number;
  duration: number;
  loopStart: number | null;
  loopEnd: number | null;
}

export function currentSourceTime(p: PositionParams): { time: number; ended: boolean } {
  const raw = p.startOffset + Math.max(0, p.elapsed) * p.tempo;
  const hasLoop =
    p.loopStart !== null && p.loopEnd !== null && p.loopEnd > p.loopStart;

  if (hasLoop) {
    const a = p.loopStart as number;
    const b = p.loopEnd as number;
    if (raw < b) return { time: Math.max(a, Math.min(raw, b)), ended: false };
    const span = b - a;
    return { time: a + ((raw - a) % span), ended: false };
  }

  if (raw >= p.duration) return { time: p.duration, ended: true };
  return { time: raw, ended: false };
}

// A seek target outside an active loop is not a playable position: native
// `source.loop` plays from the raw offset up to loopEnd before it ever wraps,
// so a seek before the region would play from there while the computed playhead
// (currentSourceTime above) is pinned at loopStart — the two disagree. Snapping
// the seek target into [loopStart, loopEnd] keeps audio and playhead in step.
// No-op when there is no loop (either bound null, or a degenerate end <= start).
export function clampIntoLoop(
  t: number,
  loopStart: number | null,
  loopEnd: number | null,
): number {
  if (loopStart === null || loopEnd === null || loopEnd <= loopStart) return t;
  return Math.max(loopStart, Math.min(t, loopEnd));
}
