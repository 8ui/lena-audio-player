import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import type { AudioEngine } from './AudioEngine';
import { currentSourceTime } from './position';
import { clampTempo, clampSemitones } from './params';

// The real @soundtouchjs/audio-worklet package (v2.1.0) ships its pre-bundled
// processor at `.dist/soundtouch-processor.js` (registered processor name
// `soundtouch-processor`). We copy that file verbatim into public/ so it can
// be served and registered via SoundTouchNode.register(ctx, url).
const WORKLET_URL = '/soundtouch-processor.js';

export class SoundTouchEngine implements AudioEngine {
  private ctx: AudioContext;
  private gain: GainNode;
  private stNode: SoundTouchNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;

  private tempo = 1;
  private semitones = 0;
  private loopStart: number | null = null;
  private loopEnd: number | null = null;

  private startOffset = 0; // source-seconds where current run began
  private startCtxTime = 0; // ctx.currentTime at source.start
  private pausedAt = 0; // last known source position while paused
  playing = false;

  private registered = false;

  onTimeUpdate?: (t: number) => void;
  onEnded?: () => void;

  constructor(ctx?: AudioContext) {
    this.ctx = ctx ?? new AudioContext();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
  }

  async load(buffer: AudioBuffer): Promise<void> {
    if (!this.registered) {
      await SoundTouchNode.register(this.ctx, WORKLET_URL);
      this.registered = true;
    }
    this.stopInternal();
    this.buffer = buffer;
    this.playing = false;
    this.pausedAt = 0;
    this.startOffset = 0;
  }

  getDuration(): number {
    return this.buffer?.duration ?? 0;
  }

  // Pure: no side effects. Natural end is handled by source.onended (below),
  // not here — this is polled ~60/s and must never mutate engine state.
  getCurrentTime(): number {
    if (!this.playing) return this.pausedAt;
    const { time } = currentSourceTime({
      startOffset: this.startOffset,
      elapsed: this.ctx.currentTime - this.startCtxTime,
      tempo: this.tempo,
      duration: this.getDuration(),
      loopStart: this.loopStart,
      loopEnd: this.loopEnd,
    });
    return time;
  }

  play(): void {
    if (!this.buffer || this.playing) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    // If playback previously ran to natural end (pausedAt sits at/after
    // duration), restart from the top instead of starting a zero-length
    // source that ends immediately. A looped track wraps on its own via
    // source.loop, so leave pausedAt alone in that case.
    const looping = this.loopStart !== null && this.loopEnd !== null && this.loopEnd > this.loopStart;
    if (!looping && this.pausedAt >= this.getDuration()) {
      this.pausedAt = 0;
    }
    this.startSource(this.pausedAt);
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedAt = this.getCurrentTime();
    this.playing = false;
    this.stopInternal();
  }

  seek(seconds: number): void {
    const t = Math.max(0, Math.min(seconds, this.getDuration()));
    this.pausedAt = t;
    if (this.playing) {
      this.stopInternal();
      this.startSource(t);
    }
  }

  setTempo(rate: number): void {
    const next = clampTempo(rate);
    if (this.source && this.stNode) {
      // Capture position under the CURRENT tempo, THEN re-anchor and switch.
      // (getCurrentTime still reads the old this.tempo here — order matters.)
      const pos = this.getCurrentTime();
      this.startOffset = pos;
      this.pausedAt = pos;
      this.startCtxTime = this.ctx.currentTime;
      this.source.playbackRate.value = next;
      this.stNode.playbackRate.value = next;
    }
    this.tempo = next;
  }

  setPitchSemitones(n: number): void {
    this.semitones = clampSemitones(n);
    if (this.stNode) this.stNode.pitchSemitones.value = this.semitones;
  }

  setLoop(start: number | null, end: number | null): void {
    this.loopStart = start;
    this.loopEnd = end;
    if (this.source) {
      const on = start !== null && end !== null && end > start;
      this.source.loop = on;
      if (on) {
        this.source.loopStart = start as number;
        this.source.loopEnd = end as number;
      }
    }
  }

  private startSource(offset: number): void {
    if (!this.buffer) return;
    // Idempotent cleanup: guarantees no previous source/node graph is left
    // dangling (e.g. after a natural end where the caller didn't stopInternal()).
    this.stopInternal();
    this.stNode = new SoundTouchNode({ context: this.ctx });
    this.stNode.connect(this.gain);
    this.stNode.playbackRate.value = this.tempo;
    this.stNode.pitchSemitones.value = this.semitones;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.tempo;
    const on = this.loopStart !== null && this.loopEnd !== null && this.loopEnd > this.loopStart;
    src.loop = on;
    if (on) {
      src.loopStart = this.loopStart as number;
      src.loopEnd = this.loopEnd as number;
    }
    src.connect(this.stNode);
    src.onended = () => {
      // stopInternal()/startSource() reassign or null this.source
      // synchronously before this async event fires; if this.source is no
      // longer `src`, this was a manual stop (pause/seek/load), not a
      // natural end — skip.
      if (this.source !== src) return;
      this.playing = false;
      this.pausedAt = this.getDuration();
      this.onEnded?.();
    };
    src.start(0, offset);

    this.source = src;
    this.startOffset = offset;
    this.startCtxTime = this.ctx.currentTime;
  }

  private stopInternal(): void {
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source?.disconnect();
    this.stNode?.disconnect();
    this.source = null;
    this.stNode = null;
  }

  dispose(): void {
    this.stopInternal();
    this.gain.disconnect();
    void this.ctx.close();
  }
}
