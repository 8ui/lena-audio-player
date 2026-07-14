import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';

export function MarkersPanel() {
  // zustand v5: a fresh-object selector needs useShallow (see LoopPanel).
  const { markers, addMarker, removeMarker, seekPrevMarker, seekNextMarker } = usePlayerStore(
    useShallow((s) => ({
      markers: s.markers,
      addMarker: s.addMarker,
      removeMarker: s.removeMarker,
      seekPrevMarker: s.seekPrevMarker,
      seekNextMarker: s.seekNextMarker,
    }))
  );
  const has = markers.length > 0;
  return (
    <>
      <button aria-label="предыдущий маркер" onClick={seekPrevMarker} disabled={!has}>
        ◀
      </button>
      <button className="primary" onClick={addMarker}>
        ＋ маркер
      </button>
      <button aria-label="следующий маркер" onClick={seekNextMarker} disabled={!has}>
        ▶
      </button>
      <button aria-label="удалить маркер" onClick={removeMarker} disabled={!has}>
        −
      </button>
    </>
  );
}
