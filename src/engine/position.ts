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
