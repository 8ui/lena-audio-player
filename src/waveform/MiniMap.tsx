import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { overviewTimeToX, overviewXToTime } from './viewport';
import { downsamplePeaks } from './computePeaks';
import type { Marker } from '../types';

export function MiniMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = usePlayerStore;

  // rAF render loop. Reads the store imperatively (never via a React selector):
  // `position` changes ~60/s, so a subscription would re-render every frame.
  // NOTE: this loop must NOT call store.tick() — WaveformCanvas owns the tick
  // (two tickers would double-poll the engine clock). If WaveformCanvas were
  // ever unmounted while MiniMap stayed mounted, this playhead would freeze —
  // they are mounted together in Player.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext('2d')!;
    let raf = 0;

    // Cache of the DOWNSAMPLED peaks (one [min,max] per pixel column). Rebuilt
    // only when the track (peaks ref) or the column count changes. Walking the
    // full-track peaks (PEAKS_RESOLUTION buckets/sec — tens of thousands) every
    // frame is what must be avoided; stroking ~cssW segments is cheap.
    let cols: Float32Array | null = null;
    let colsForPeaks: Float32Array | null = null;
    let colsCount = 0;

    // Dirty check: this and WaveformCanvas each run their own rAF loop, so skip
    // the draw body entirely when nothing visible changed (idle/paused battery).
    let lastPos = NaN;
    let lastA: number | null = null;
    let lastB: number | null = null;
    let lastMarkers: Marker[] | null = null;
    let lastPeaks: Float32Array | null = null;
    let lastW = -1;
    let lastH = -1;
    let lastDpr = -1;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const { peaks, duration, position, loopStart, loopEnd, markers } = store.getState();

      const clean =
        position === lastPos &&
        loopStart === lastA &&
        loopEnd === lastB &&
        markers === lastMarkers &&
        peaks === lastPeaks &&
        cssW === lastW &&
        cssH === lastH &&
        // dpr must be part of the check: it can change with no CSS-size change
        // (window dragged to another display, browser zoom). Without it the
        // draw would be skipped and the backing store left at the old
        // resolution — a blurry strip until the next resize.
        dpr === lastDpr;
      if (clean) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastPos = position;
      lastA = loopStart;
      lastB = loopEnd;
      lastMarkers = markers;
      lastPeaks = peaks;
      lastW = cssW;
      lastH = cssH;
      lastDpr = dpr;

      // Round: canvas.width is an unsigned long, so comparing it against a
      // fractional cssW*dpr (Android dpr 2.625/2.75) is always true — the
      // backing store would be reallocated every single frame.
      const bw = Math.round(cssW * dpr);
      const bh = Math.round(cssH * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cssW, cssH);

      if (cssW <= 0 || cssH <= 0) {
        raf = requestAnimationFrame(draw);
        return;
      }

      // waveform (whole track, from the column cache)
      if (peaks && peaks.length > 0) {
        const n = Math.max(1, Math.floor(cssW));
        if (cols === null || colsForPeaks !== peaks || colsCount !== n) {
          cols = downsamplePeaks(peaks, n);
          colsForPeaks = peaks;
          colsCount = n;
        }
        const mid = cssH / 2;
        g.strokeStyle = '#3f6ea8';
        g.lineWidth = 1;
        g.beginPath();
        for (let c = 0; c < n; c++) {
          const min = cols[c * 2];
          const max = cols[c * 2 + 1];
          const x = c + 0.5;
          g.moveTo(x, mid - max * mid);
          g.lineTo(x, mid - min * mid);
        }
        g.stroke();
      }

      // loop region
      if (loopStart !== null && loopEnd !== null && loopEnd > loopStart) {
        const xa = overviewTimeToX(loopStart, duration, cssW);
        const xb = overviewTimeToX(loopEnd, duration, cssW);
        g.fillStyle = 'rgba(90,160,255,0.22)';
        g.fillRect(xa, 0, xb - xa, cssH);
      }

      // playhead
      const px = overviewTimeToX(position, duration, cssW);
      g.strokeStyle = '#ff5a5a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px, 0);
      g.lineTo(px, cssH);
      g.stroke();

      // markers LAST — same convention as WaveformCanvas: at minimap scale the
      // whole track compresses into a few hundred px, so a marker near the
      // playhead would be swallowed by the red line if drawn under it.
      g.strokeStyle = '#ffcf5a';
      g.lineWidth = 1;
      for (const m of markers) {
        const x = overviewTimeToX(m.time, duration, cssW);
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, cssH);
        g.stroke();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [store]);

  // Gestures: tap or drag anywhere on the strip seeks to that point in the track.
  //
  // Tracked by Touch.identifier, NOT by e.touches.length: MiniMap only receives
  // events for touches that STARTED on it, so a second finger landing on the
  // sibling WaveformCanvas never shows up in a length check — a length-based
  // onEnd would bail forever, leaving the strip dead with playback stuck paused.
  //
  // Pause is deferred to the first touchmove so a bare tap is a single seek
  // (pausing on touchstart would restart the audio source twice: pause + play).
  useEffect(() => {
    const canvas = canvasRef.current!;
    let activeId: number | null = null;
    let pausedByDrag = false;
    let wasPlaying = false;

    const seekToClientX = (clientX: number) => {
      const s = store.getState();
      const rect = canvas.getBoundingClientRect();
      s.seek(overviewXToTime(clientX - rect.left, s.duration, rect.width));
    };

    const findActive = (list: TouchList): Touch | null => {
      if (activeId === null) return null;
      for (let i = 0; i < list.length; i++) {
        if (list[i].identifier === activeId) return list[i];
      }
      return null;
    };

    const onStart = (e: TouchEvent) => {
      if (activeId !== null) return; // already tracking a finger on the strip
      const t = e.changedTouches[0];
      if (!t) return;
      activeId = t.identifier;
      wasPlaying = store.getState().playing;
      pausedByDrag = false;
      seekToClientX(t.clientX);
    };

    const onMove = (e: TouchEvent) => {
      const t = findActive(e.touches);
      if (!t) return;
      e.preventDefault();
      // First actual movement: this is a scrub, not a tap — pause for it.
      if (!pausedByDrag && wasPlaying) {
        store.getState().togglePlay();
        pausedByDrag = true;
      }
      seekToClientX(t.clientX);
    };

    const onEnd = (e: TouchEvent) => {
      if (!findActive(e.changedTouches)) return; // not our finger
      if (pausedByDrag && wasPlaying) store.getState().togglePlay();
      activeId = null;
      pausedByDrag = false;
      wasPlaying = false;
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onEnd);
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onEnd);
    };
  }, [store]);

  return <canvas ref={canvasRef} className="minimap" style={{ touchAction: 'none' }} />;
}
