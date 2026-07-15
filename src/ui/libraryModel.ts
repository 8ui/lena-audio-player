import type { TrackRecord } from '../types';

// Everything the library screen computes per track lives here, so the card can
// stay a pure render of values it was handed. Same rule as waveform/markers.ts:
// logic that lives inside a component is logic that ships bugs no test sees.

// db.listTracks() is a bare getAll('tracks') — object-store key order, i.e. no
// order at all. Newest first is what the screen promises.
export function sortTracks(tracks: TrackRecord[]): TrackRecord[] {
  return [...tracks].sort((a, b) => b.createdAt - a.createdAt);
}

// Guarded against duration <= 0: a NaN or Infinity here would propagate into
// every bar's SVG geometry and blank the card.
export function progressRatio(lastPosition: number, duration: number): number {
  if (!(duration > 0)) return 0;
  return Math.min(1, Math.max(0, lastPosition / duration));
}

// The badges answer "what was I doing with this track" without opening it, so
// they only appear when the value is NOT the default.
export function tempoBadge(tempo: number): string | null {
  const pct = Math.round(tempo * 100);
  return pct === 100 ? null : `${pct}%`;
}

export function pitchBadge(pitch: number): string | null {
  if (pitch === 0) return null;
  // U+2212 MINUS SIGN, not a hyphen: at arm's length a hyphen next to a digit
  // reads as dirt on the screen.
  return pitch > 0 ? `+${pitch}` : `−${Math.abs(pitch)}`;
}

// Same condition the engine and the minimap use — a loop only exists when B is
// past A.
export function loopBadge(loopStart: number | null, loopEnd: number | null): string | null {
  if (loopStart === null || loopEnd === null || loopEnd <= loopStart) return null;
  return 'A–B';
}
