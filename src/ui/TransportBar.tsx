import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TransportBar() {
  // See LoopControls.tsx for why useShallow is required here (zustand v5
  // object-selector infinite-loop gotcha).
  const { playing, position, duration, togglePlay, seek } = usePlayerStore(
    useShallow((s) => ({
      playing: s.playing,
      position: s.position,
      duration: s.duration,
      togglePlay: s.togglePlay,
      seek: s.seek,
    }))
  );
  return (
    <div className="transport">
      <button aria-label="назад 5с" onClick={() => seek(Math.max(0, position - 5))}>−5</button>
      <button aria-label={playing ? 'пауза' : 'играть'} className="play" onClick={togglePlay}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button aria-label="вперёд 5с" onClick={() => seek(Math.min(duration, position + 5))}>+5</button>
      <span className="time">{fmt(position)} / {fmt(duration)}</span>
    </div>
  );
}
