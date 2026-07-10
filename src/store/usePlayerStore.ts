import { create } from 'zustand';
import type { AudioEngine } from '../engine/AudioEngine';
import { SoundTouchEngine } from '../engine/SoundTouchEngine';
import { clampTempo, clampSemitones } from '../engine/params';
import { computePeaks } from '../waveform/computePeaks';
import { clampPxPerSec, PX_PER_SEC_DEFAULT } from '../waveform/viewport';
import * as db from '../storage/db';
import type { TrackRecord } from '../types';

let sharedCtx: AudioContext | null = null;
function ctx(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}

let engineFactory: () => AudioEngine = () => new SoundTouchEngine(ctx());
let engine: AudioEngine | null = null;

export function __setEngineFactory(f: () => AudioEngine) {
  engineFactory = f;
  engine = null;
}

function ensureEngine(): AudioEngine {
  if (!engine) {
    engine = engineFactory();
    engine.onEnded = () => usePlayerStore.setState({ playing: false });
  }
  return engine;
}

interface PlayerState {
  library: TrackRecord[];
  currentTrackId: string | null;
  peaks: Float32Array | null;
  duration: number;
  playing: boolean;
  position: number;
  tempo: number;
  pitch: number;
  loopStart: number | null;
  loopEnd: number | null;
  pxPerSec: number;

  init(): Promise<void>;
  importFile(file: File): Promise<void>;
  openTrack(id: string): Promise<void>;
  removeTrack(id: string): Promise<void>;
  closeTrack(): void;
  togglePlay(): void;
  seek(t: number): void;
  setTempo(t: number): void;
  setPitch(n: number): void;
  setLoopA(): void;
  setLoopB(): void;
  clearLoop(): void;
  setPxPerSec(v: number): void;
  tick(): void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow() {
  const s = usePlayerStore.getState();
  if (!s.currentTrackId) return;
  void db.saveState({
    trackId: s.currentTrackId,
    tempo: s.tempo,
    pitch: s.pitch,
    loopStart: s.loopStart,
    loopEnd: s.loopEnd,
    pxPerSec: s.pxPerSec,
    markers: [],
    lastPosition: s.position,
  });
}

// Debounced: pan/slider drags fire many times a second; coalesce IDB writes.
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 400);
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  library: [],
  currentTrackId: null,
  peaks: null,
  duration: 0,
  playing: false,
  position: 0,
  tempo: 1,
  pitch: 0,
  loopStart: null,
  loopEnd: null,
  pxPerSec: PX_PER_SEC_DEFAULT,

  async init() {
    set({ library: await db.listTracks() });
  },

  async importFile(file) {
    const arr = await file.arrayBuffer();
    const audioBuffer = await ctx().decodeAudioData(arr.slice(0));
    const peaks = computePeaks(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
    const rec: TrackRecord = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, ''),
      blob: file,
      peaks,
      duration: audioBuffer.duration,
      createdAt: Date.now(),
    };
    await db.addTrack(rec);
    set({ library: await db.listTracks() });
  },

  async openTrack(id) {
    const rec = await db.getTrack(id);
    if (!rec) return;
    const e = ensureEngine();
    const arr = await rec.blob.arrayBuffer();
    const audioBuffer = await ctx().decodeAudioData(arr.slice(0));
    await e.load(audioBuffer);
    const st = (await db.getState(id)) ?? db.defaultState(id);
    e.setTempo(st.tempo);
    e.setPitchSemitones(st.pitch);
    e.setLoop(st.loopStart, st.loopEnd);
    e.seek(st.lastPosition);
    set({
      currentTrackId: id,
      peaks: rec.peaks,
      duration: rec.duration,
      tempo: st.tempo,
      pitch: st.pitch,
      loopStart: st.loopStart,
      loopEnd: st.loopEnd,
      pxPerSec: st.pxPerSec,
      position: st.lastPosition,
      playing: false,
    });
  },

  async removeTrack(id) {
    await db.deleteTrack(id);
    if (get().currentTrackId === id) get().closeTrack();
    set({ library: await db.listTracks() });
  },

  closeTrack() {
    engine?.pause();
    set({ currentTrackId: null, playing: false, peaks: null, position: 0 });
  },

  togglePlay() {
    if (!get().currentTrackId) return;
    const e = ensureEngine();
    if (get().playing) {
      e.pause();
      set({ playing: false });
    } else {
      e.play();
      set({ playing: true });
    }
    persist();
  },

  seek(t) {
    engine?.seek(t);
    set({ position: t });
    persist();
  },

  setTempo(t) {
    const v = clampTempo(t);
    engine?.setTempo(v);
    set({ tempo: v });
    persist();
  },

  setPitch(n) {
    const v = clampSemitones(n);
    engine?.setPitchSemitones(v);
    set({ pitch: v });
    persist();
  },

  setLoopA() {
    set({ loopStart: get().position });
    const { loopStart, loopEnd } = get();
    engine?.setLoop(loopStart, loopEnd);
    persist();
  },

  setLoopB() {
    set({ loopEnd: get().position });
    const { loopStart, loopEnd } = get();
    engine?.setLoop(loopStart, loopEnd);
    persist();
  },

  clearLoop() {
    set({ loopStart: null, loopEnd: null });
    engine?.setLoop(null, null);
    persist();
  },

  setPxPerSec(v) {
    set({ pxPerSec: clampPxPerSec(v) });
    persist();
  },

  tick() {
    if (!engine) return;
    set({ position: engine.getCurrentTime(), playing: engine.playing });
  },
}));
