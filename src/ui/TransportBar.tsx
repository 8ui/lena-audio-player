import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';

// Play only. Seeking ±5s went away with the redesign: the waveform is a pan
// gesture and the minimap is a relative scrub, both of which beat a 5s hop.
export function TransportBar() {
  // zustand v5: a fresh-object selector needs useShallow (see LoopPanel).
  const { playing, togglePlay } = usePlayerStore(
    useShallow((s) => ({ playing: s.playing, togglePlay: s.togglePlay }))
  );
  return (
    <div className="transport">
      <button aria-label={playing ? 'пауза' : 'играть'} className="play" onClick={togglePlay}>
        {playing ? '❚❚' : '▶'}
      </button>
    </div>
  );
}
