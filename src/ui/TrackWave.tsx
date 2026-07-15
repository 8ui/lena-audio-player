import { useMemo } from 'react';
import { downsamplePeaks } from '../waveform/computePeaks';

// Column count for the card preview. Denser than the old 48-bar version so the
// card reads like the player's own waveform, but still a FIXED count (not
// per-pixel) so the SVG stays cheap and resolution-independent.
export const COLS = 120;

// Half the viewBox height. Bars span min..max around this centre line, exactly
// like the player canvas (WaveformCanvas): top = MID - max*MID,
// bottom = MID - min*MID. That true-min/max asymmetry is what makes the preview
// match the track page instead of the old mirrored-bar look.
const MID = 10;
// A silent passage must still leave a visible hairline, or the card looks broken.
const MIN_HALF = 0.5;
// Bar width in viewBox units (columns are 1 unit wide); the remainder is the gap.
const BAR_W = 0.7;

const clamp1 = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v);

export interface WaveBar {
  /** viewBox y of the bar's top edge (max amplitude). */
  top: number;
  /** viewBox y of the bar's bottom edge (min amplitude). */
  bottom: number;
}

interface Props {
  peaks: Float32Array;
  /** 0..1 — see progressRatio in libraryModel. */
  progress: number;
}

// Pure geometry, exported so it's unit-tested rather than trusted inside the
// component (same rule as waveform/markers.ts). Reduces the full peaks to
// `colCount` real [min,max] columns via downsamplePeaks (the minimap's own
// reduction, already tested) and maps each to a viewBox bar, applying the
// hairline floor so a silent bucket never collapses to zero height.
export function waveBars(peaks: Float32Array, colCount: number): WaveBar[] {
  const cols = downsamplePeaks(peaks, colCount);
  // downsamplePeaks returns [] when the track has no peaks at all; a flat card
  // still has to render, so treat every column as silence (min=max=0).
  const has = cols.length > 0;
  const out: WaveBar[] = [];
  for (let i = 0; i < colCount; i++) {
    const max = has ? clamp1(cols[i * 2 + 1]) : 0;
    const min = has ? clamp1(cols[i * 2]) : 0;
    let top = MID - max * MID;
    let bottom = MID - min * MID;
    if (bottom - top < MIN_HALF * 2) {
      // Silence (or a near-flat bucket): centre a hairline, clamped inside the box.
      const c = Math.min(2 * MID - MIN_HALF, Math.max(MIN_HALF, (top + bottom) / 2));
      top = c - MIN_HALF;
      bottom = c + MIN_HALF;
    }
    out.push({ top, bottom });
  }
  return out;
}

const seg = (b: WaveBar, i: number): string => {
  const x = i + (1 - BAR_W) / 2;
  return `M${x.toFixed(2)} ${b.top.toFixed(2)}h${BAR_W}V${b.bottom.toFixed(2)}h-${BAR_W}Z`;
};

// Deliberately NOT a canvas (see the plan/CLAUDE.md): every colour here comes
// from a CSS variable, so switching the theme recolours every card for free —
// no palette read, no redraw, no imperative code to get wrong. And it's TWO
// <path> elements (played / unplayed), not one <rect> per column, so a denser
// preview costs 2 DOM nodes per card instead of COLS of them.
export function TrackWave({ peaks, progress }: Props) {
  const bars = useMemo(() => waveBars(peaks, COLS), [peaks]);
  const played = Math.round(progress * COLS);

  let playedD = '';
  let restD = '';
  bars.forEach((b, i) => {
    const s = seg(b, i);
    if (i < played) playedD += s;
    else restD += s;
  });

  return (
    <svg
      className="track-wave"
      viewBox={`0 0 ${COLS} ${MID * 2}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={restD} />
      <path className="played" d={playedD} />
    </svg>
  );
}
