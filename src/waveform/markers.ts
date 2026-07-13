import type { Marker } from '../types';

// A "− маркер" tap removes the marker nearest the playhead, but only if it is
// within this many seconds — so a stray tap far from any marker does nothing.
export const MARKER_DELETE_THRESHOLD = 1;

export function relabel(markers: Marker[]): Marker[] {
  return [...markers]
    .sort((a, b) => a.time - b.time)
    .map((m, i) => ({ ...m, label: String(i + 1) }));
}

export function insertMarker(markers: Marker[], marker: Marker): Marker[] {
  return relabel([...markers, marker]);
}

export function removeNearestMarker(
  markers: Marker[],
  time: number,
  threshold: number = MARKER_DELETE_THRESHOLD,
): Marker[] {
  if (markers.length === 0) return markers;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < markers.length; i++) {
    const d = Math.abs(markers[i].time - time);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx === -1 || bestDist > threshold) return markers;
  return relabel(markers.filter((_, i) => i !== bestIdx));
}

export function nextMarkerTime(markers: Marker[], time: number): number | null {
  let best: number | null = null;
  for (const m of markers) {
    if (m.time > time && (best === null || m.time < best)) best = m.time;
  }
  return best;
}

export function prevMarkerTime(markers: Marker[], time: number): number | null {
  let best: number | null = null;
  for (const m of markers) {
    if (m.time < time && (best === null || m.time > best)) best = m.time;
  }
  return best;
}
