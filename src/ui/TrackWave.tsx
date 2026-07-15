import { useMemo } from 'react';
import { barHeights } from '../waveform/computePeaks';

export const BARS = 48;

// Half the viewBox height. Bars are drawn symmetrically around the centre line.
const MID = 10;
// A silent passage must still leave a visible hairline, or the card looks broken.
const MIN_HALF = 0.5;

interface Props {
  peaks: Float32Array;
  /** 0..1 — see progressRatio in libraryModel. */
  progress: number;
}

// Deliberately NOT a canvas (see the plan/CLAUDE.md): every colour here comes
// from a CSS variable, so switching the theme recolours every card for free —
// no palette read, no redraw, no imperative code to get wrong.
export function TrackWave({ peaks, progress }: Props) {
  const bars = useMemo(() => barHeights(peaks, BARS), [peaks]);
  const played = Math.round(progress * BARS);

  return (
    <svg
      className="track-wave"
      viewBox={`0 0 ${BARS * 2} ${MID * 2}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bars.map((h, i) => {
        const half = Math.max(MIN_HALF, h * MID);
        return (
          <rect
            key={i}
            className={i < played ? 'played' : undefined}
            x={i * 2}
            y={MID - half}
            width={1}
            height={half * 2}
          />
        );
      })}
    </svg>
  );
}
