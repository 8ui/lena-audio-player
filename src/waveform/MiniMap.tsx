import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { overviewTimeToX } from './viewport';
import { downsamplePeaks } from './computePeaks';
import {
  idleGesture,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  type GestureState,
  type GestureCtx,
  type GestureEffects,
} from './minimapGesture';
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

  // Gestures: RELATIVE scrub, driven by the pure reducer in ./minimapGesture.
  // Touching the strip changes nothing — the playhead stays put and then moves
  // BY the finger's delta (finger right => forward). Absolute "jump to where you
  // tapped" was unusable: on a 48px strip a 3mm miss threw you ~20s away.
  //
  // All the logic lives in the reducer so it can be unit-tested without a canvas
  // (identifier matching, the slop threshold, anchor-after-pause ordering, the
  // natural-end race) — every bug this handler has ever shipped was one of those.
  // This effect is only the DOM adapter: event -> reducer -> apply effects.
  useEffect(() => {
    const canvas = canvasRef.current!;
    let g: GestureState = idleGesture;

    const apply = (effects: GestureEffects) => {
      const s = store.getState();
      if (effects.pause || effects.resume) s.togglePlay();
      if (effects.seek !== undefined) s.seek(effects.seek);
    };

    const ctx = (): GestureCtx => {
      const s = store.getState();
      return {
        playing: s.playing,
        position: s.position,
        duration: s.duration,
        width: canvas.getBoundingClientRect().width,
      };
    };

    const ids = (list: TouchList): number[] => {
      const out: number[] = [];
      for (let i = 0; i < list.length; i++) out.push(list[i].identifier);
      return out;
    };
    const find = (list: TouchList, id: number | null): Touch | null => {
      if (id === null) return null;
      for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    };

    const onStart = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const step = onTouchStart(g, t.identifier, t.clientX);
      g = step.state;
      apply(step.effects);
    };

    const onMove = (e: TouchEvent) => {
      // targetTouches, not touches — fingers that started on THIS canvas (see
      // CLAUDE.md). Matching by identifier already made this safe, but the rule
      // holds for both canvases so nobody copies the pattern without the guard.
      const t = find(e.targetTouches, g.activeId);
      if (!t) return;
      e.preventDefault();
      const step = onTouchMove(g, t.identifier, t.clientX, ctx());
      g = step.state;
      apply(step.effects);
    };

    const onEnd = (e: TouchEvent) => {
      const step = onTouchEnd(g, ids(e.changedTouches));
      g = step.state;
      apply(step.effects);
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
