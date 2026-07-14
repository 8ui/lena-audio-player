import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';

export function PlayerHeader() {
  // zustand v5: a fresh-object selector needs useShallow (see LoopPanel).
  const { name, closeTrack } = usePlayerStore(
    useShallow((s) => ({
      name: s.library.find((t) => t.id === s.currentTrackId)?.name ?? '',
      closeTrack: s.closeTrack,
    }))
  );
  return (
    <header className="player-header">
      <button className="back" aria-label="назад" onClick={closeTrack}>
        ‹ Библиотека
      </button>
      <span className="track-name">{name}</span>
    </header>
  );
}
