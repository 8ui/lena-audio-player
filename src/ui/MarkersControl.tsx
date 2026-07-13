import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';

export function MarkersControl() {
  // zustand v5: a fresh-object selector needs useShallow (see LoopControls).
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
    <div className="control markers">
      <button onClick={addMarker}>＋ маркер</button>
      <button aria-label="предыдущий маркер" onClick={seekPrevMarker} disabled={!has}>◀</button>
      <button aria-label="следующий маркер" onClick={seekNextMarker} disabled={!has}>▶</button>
      <button aria-label="удалить маркер" onClick={removeMarker} disabled={!has}>− маркер</button>
    </div>
  );
}
