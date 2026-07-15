import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { timeToX, xToTime, clampPxPerSec } from './viewport';
import { activePalette } from '../ui/theme';
import { INERTIA_CONFIG } from './inertiaConfig';
import {
  velocityFromSamples,
  snapTargets,
  planFling,
  flingPositionAt,
  type VelocitySample,
} from './inertia';

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
      const p = activePalette();
      if (s.playing) s.tick();
      const { peaks, position, pxPerSec, loopStart, loopEnd, duration, markers } = store.getState();

      // loop region
      if (loopStart !== null && loopEnd !== null) {
        const xa = timeToX(loopStart, position, pxPerSec, cssW);
        const xb = timeToX(loopEnd, position, pxPerSec, cssW);
        g.fillStyle = p.loopFill;
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
        g.strokeStyle = p.accent;
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
      g.strokeStyle = p.playhead;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cssW / 2, 0);
      g.lineTo(cssW / 2, cssH);
      g.stroke();

      // markers (drawn after the playhead so a marker at the current position
      // shows its tick over the centered playhead line)
      for (const m of markers) {
        const x = timeToX(m.time, position, pxPerSec, cssW);
        if (x < 0 || x > cssW) continue;
        g.strokeStyle = p.marker;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, cssH);
        g.stroke();
        g.fillStyle = p.marker;
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
    // wasPlaying spans the whole pan -> fling handoff: playback is paused for
    // the gesture and resumed only when the glide settles, not at touchend.
    let wasPlaying = false;

    // Velocity ring buffer, fed on every pan move; read once at release.
    const samples: VelocitySample[] = [];
    const pushSample = (x: number) => {
      samples.push({ x, t: performance.now() });
      if (samples.length > INERTIA_CONFIG.velocityBufferSize) samples.shift();
    };

    // Dedicated fling rAF. It only ever calls store.seek() — NEVER store.tick()
    // — so WaveformCanvas's draw loop stays the sole engine-clock ticker.
    let flingRaf = 0;
    const cancelFling = () => {
      if (flingRaf) {
        cancelAnimationFrame(flingRaf);
        flingRaf = 0;
      }
    };

    const reducedMotion =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Resume playback (if it was playing) and clear the pause flag. Called at
    // the end of every settle path.
    const finishGesture = () => {
      cancelFling();
      if (wasPlaying) store.getState().togglePlay();
      wasPlaying = false;
    };

    const startFling = () => {
      const s = store.getState();
      const velocityPx = velocityFromSamples(
        samples,
        performance.now(),
        INERTIA_CONFIG.velocityWindowMs,
      );
      const from = s.position;
      const plan = planFling({
        position: from,
        velocityPx,
        pxPerSec: s.pxPerSec,
        duration: s.duration,
        targets: snapTargets(s.markers, s.duration),
        cfg: INERTIA_CONFIG,
      });

      // Nothing to travel (a bare tap with no snap target nearby): resume at
      // once instead of running a 300ms no-op glide that would gap playback.
      if (Math.abs(plan.target - from) < 1e-4) {
        finishGesture();
        return;
      }

      if (
        (INERTIA_CONFIG.respectReducedMotion && reducedMotion) ||
        plan.durationMs <= 0
      ) {
        store.getState().seek(plan.target);
        finishGesture();
        return;
      }

      const startT = performance.now();
      const step = () => {
        const { position, done } = flingPositionAt(
          from,
          plan.target,
          plan.durationMs,
          performance.now() - startT,
        );
        store.getState().seek(position);
        if (done) {
          finishGesture();
          return;
        }
        flingRaf = requestAnimationFrame(step);
      };
      flingRaf = requestAnimationFrame(step);
    };

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
        // A touch landing mid-fling adopts the in-progress pause: cancel the
        // glide but keep wasPlaying so the next release still resumes.
        const flinging = flingRaf !== 0;
        cancelFling();
        mode = 'pan';
        lastX = e.targetTouches[0].clientX;
        samples.length = 0;
        pushSample(lastX);
        if (!flinging) {
          wasPlaying = s.playing;
          if (wasPlaying) s.togglePlay();
        }
      } else if (e.targetTouches.length === 2) {
        // Cancel any fling; wasPlaying persists and resumes on the pinch's
        // touchend chain.
        cancelFling();
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
        pushSample(x);
        s.seek(Math.max(0, Math.min(s.position + dt, s.duration)));
      } else if (mode === 'pinch' && e.targetTouches.length === 2) {
        const factor = dist(e.targetTouches) / pinchStartDist;
        s.setPxPerSec(clampPxPerSec(pinchStartPx * factor));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.targetTouches.length === 0) {
        if (mode === 'pan') {
          // Hand the pan off to the glide; it resumes playback when it settles.
          mode = 'none';
          startFling();
        } else {
          // Pinch (or idle) ended: resume directly.
          mode = 'none';
          if (wasPlaying) {
            store.getState().togglePlay();
            wasPlaying = false;
          }
        }
      } else if (e.targetTouches.length === 1 && mode === 'pinch') {
        // Lifting one of two fingers drops back to pan: start a fresh velocity
        // trace from here so the eventual release flings correctly.
        mode = 'pan';
        lastX = e.targetTouches[0].clientX;
        samples.length = 0;
        pushSample(lastX);
      }
    };
    // Without touchcancel a cancelled gesture strands playback paused forever.
    // Cancel settles immediately — no fling on an aborted gesture — and resumes
    // playback if it was playing.
    const onCancel = () => {
      cancelFling();
      mode = 'none';
      samples.length = 0;
      if (wasPlaying) {
        store.getState().togglePlay();
        wasPlaying = false;
      }
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onCancel);
    return () => {
      cancelFling();
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onCancel);
    };
  }, [store]);

  return <canvas ref={canvasRef} className="waveform" style={{ touchAction: 'none' }} />;
}
