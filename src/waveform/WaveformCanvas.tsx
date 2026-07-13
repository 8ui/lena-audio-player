import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { timeToX, xToTime, clampPxPerSec } from './viewport';

export function WaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = usePlayerStore;

  // rAF render loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext('2d')!;
    let raf = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      // canvas.width is an unsigned long: assigning a fractional cssW*dpr
      // (Android dpr 2.625/2.75) truncates, so the !== comparison stays true
      // forever and the backing store is reallocated every frame. Round first.
      const bw = Math.round(cssW * dpr);
      const bh = Math.round(cssH * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cssW, cssH);

      const s = store.getState();
      if (s.playing) s.tick();
      const { peaks, position, pxPerSec, loopStart, loopEnd, duration, markers } = store.getState();

      // loop region
      if (loopStart !== null && loopEnd !== null) {
        const xa = timeToX(loopStart, position, pxPerSec, cssW);
        const xb = timeToX(loopEnd, position, pxPerSec, cssW);
        g.fillStyle = 'rgba(90,160,255,0.18)';
        g.fillRect(xa, 0, xb - xa, cssH);
      }

      // waveform peaks within visible window
      if (peaks && peaks.length > 0 && duration > 0) {
        const mid = cssH / 2;
        // Derived from the actual peaks data, not the nominal RES constant:
        // computePeaks buckets by Math.round(sampleRate/RES) samples, which
        // for e.g. 44100Hz != exactly RES buckets/sec — using 1/RES here
        // drifts the waveform out of sync with the real audio playhead.
        const secondsPerBucket = duration / (peaks.length / 2);
        const leftTime = xToTime(0, position, pxPerSec, cssW);
        const rightTime = xToTime(cssW, position, pxPerSec, cssW);
        const firstBucket = Math.max(0, Math.floor(leftTime / secondsPerBucket));
        const lastBucket = Math.min(peaks.length / 2 - 1, Math.ceil(rightTime / secondsPerBucket));
        g.strokeStyle = '#5aa0ff';
        g.beginPath();
        for (let b = firstBucket; b <= lastBucket; b++) {
          const t = b * secondsPerBucket;
          const x = timeToX(t, position, pxPerSec, cssW);
          const min = peaks[b * 2];
          const max = peaks[b * 2 + 1];
          g.moveTo(x, mid - max * mid);
          g.lineTo(x, mid - min * mid);
        }
        g.stroke();
      }

      // fixed center playhead
      g.strokeStyle = '#ff5a5a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cssW / 2, 0);
      g.lineTo(cssW / 2, cssH);
      g.stroke();

      // markers (drawn after the playhead so a marker at the current position
      // shows its amber tick over the centered red playhead line)
      for (const m of markers) {
        const x = timeToX(m.time, position, pxPerSec, cssW);
        if (x < 0 || x > cssW) continue;
        g.strokeStyle = '#ffcf5a';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, cssH);
        g.stroke();
        g.fillStyle = '#ffcf5a';
        g.font = '12px system-ui, sans-serif';
        g.fillText(m.label, x + 3, 14);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [store]);

  // gestures
  useEffect(() => {
    const canvas = canvasRef.current!;
    let mode: 'none' | 'pan' | 'pinch' = 'none';
    let lastX = 0;
    let pinchStartDist = 0;
    let pinchStartPx = 100;
    let wasPlaying = false;

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    // e.targetTouches, NEVER e.touches: `touches` counts every finger on the
    // SCREEN, not just those that started on this canvas. A finger resting on
    // the sibling MiniMap (relative scrub means long holds there are normal)
    // plus a finger landing here made length === 2 -> this canvas entered pinch
    // mode and computed pinchStartDist between a minimap finger and a waveform
    // finger, so any further movement silently zoomed pxPerSec.
    const onStart = (e: TouchEvent) => {
      const s = store.getState();
      if (e.targetTouches.length === 1 && mode === 'none') {
        mode = 'pan';
        lastX = e.targetTouches[0].clientX;
        wasPlaying = s.playing;
        if (wasPlaying) s.togglePlay();
      } else if (e.targetTouches.length === 2) {
        mode = 'pinch';
        pinchStartDist = Math.max(1, dist(e.targetTouches));
        pinchStartPx = s.pxPerSec;
      }
    };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const s = store.getState();
      if (mode === 'pan' && e.targetTouches.length === 1) {
        const x = e.targetTouches[0].clientX;
        const dt = -(x - lastX) / s.pxPerSec;
        lastX = x;
        s.seek(Math.max(0, Math.min(s.position + dt, s.duration)));
      } else if (mode === 'pinch' && e.targetTouches.length === 2) {
        const factor = dist(e.targetTouches) / pinchStartDist;
        s.setPxPerSec(clampPxPerSec(pinchStartPx * factor));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.targetTouches.length === 0) {
        if (wasPlaying) store.getState().togglePlay();
        mode = 'none';
        wasPlaying = false;
      } else if (e.targetTouches.length === 1 && mode === 'pinch') {
        mode = 'pan';
        lastX = e.targetTouches[0].clientX;
      }
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    // Without touchcancel a cancelled pan leaves mode='pan' and wasPlaying=true
    // — playback would stay paused forever.
    canvas.addEventListener('touchcancel', onEnd);
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onEnd);
    };
  }, [store]);

  return <canvas ref={canvasRef} className="waveform" style={{ touchAction: 'none' }} />;
}
