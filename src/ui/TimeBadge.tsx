import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { fmtTime } from './time';

// Sits on top of the waveform (see .time-badge in styles.css: pointer-events
// is none, so a pan gesture starting under it still reaches the canvas).
export function TimeBadge() {
  // zustand v5: a fresh-object selector needs useShallow (see LoopPanel).
  const { position, duration } = usePlayerStore(
    useShallow((s) => ({ position: s.position, duration: s.duration }))
  );
  return (
    <div className="time-badge">
      {fmtTime(position)} <span className="total">/ {fmtTime(duration)}</span>
    </div>
  );
}
