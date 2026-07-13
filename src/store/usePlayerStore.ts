import { create } from 'zustand';
import type { AudioEngine } from '../engine/AudioEngine';
import { SoundTouchEngine } from '../engine/SoundTouchEngine';
import { clampTempo, clampSemitones } from '../engine/params';
import { computePeaks } from '../waveform/computePeaks';
import { clampPxPerSec, PX_PER_SEC_DEFAULT } from '../waveform/viewport';
import * as db from '../storage/db';
import type { TrackRecord, Marker } from '../types';
import {
  insertMarker,
  removeNearestMarker,
  nextMarkerTime,
  prevMarkerTime,
} from '../waveform/markers';
import { uuid } from '../uuid';

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
  error: string | null;
  markers: Marker[];

  init(): Promise<void>;
  importFile(file: File): Promise<void>;
  openTrack(id: string): Promise<void>;
  clearError(): void;
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
  addMarker(): void;
  removeMarker(): void;
  seekPrevMarker(): void;
  seekNextMarker(): void;
  tick(): void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow(): Promise<void> | undefined {
  const s = usePlayerStore.getState();
  if (!s.currentTrackId) return undefined;
  return db.saveState({
    trackId: s.currentTrackId,
    tempo: s.tempo,
    pitch: s.pitch,
    loopStart: s.loopStart,
    loopEnd: s.loopEnd,
    pxPerSec: s.pxPerSec,
    markers: s.markers,
    lastPosition: s.position,
  });
}

// Debounced: pan/slider drags fire many times a second; coalesce IDB writes.
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, 400);
}

// Cancels any pending debounced write and persists the CURRENT state right
// away. Used at navigation boundaries (closeTrack/openTrack) so a change
// made <400ms before leaving isn't dropped when currentTrackId flips.
function flushPersist(): Promise<void> | undefined {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  return persistNow();
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
  error: null,
  markers: [],

  async init() {
    set({ library: await db.listTracks() });
  },

  async importFile(file) {
    set({ error: null });
    let audioBuffer: AudioBuffer;
    try {
      const arr = await file.arrayBuffer();
      audioBuffer = await ctx().decodeAudioData(arr.slice(0));
    } catch {
      set({ error: 'Не удалось открыть файл — формат не поддерживается или файл повреждён.' });
      return;
    }
    const peaks = computePeaks(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
    const rec: TrackRecord = {
      id: uuid(),
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
    flushPersist();
    set({ error: null });
    const rec = await db.getTrack(id);
    if (!rec) return;
    const e = ensureEngine();
    let audioBuffer: AudioBuffer;
    try {
      const arr = await rec.blob.arrayBuffer();
      audioBuffer = await ctx().decodeAudioData(arr.slice(0));
    } catch {
      set({ error: 'Не удалось открыть трек — файл повреждён или формат не поддерживается.' });
      return;
    }
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
      tempo: clampTempo(st.tempo),
      pitch: clampSemitones(st.pitch),
      loopStart: st.loopStart,
      loopEnd: st.loopEnd,
      pxPerSec: clampPxPerSec(st.pxPerSec),
      position: st.lastPosition,
      playing: false,
      markers: st.markers,
    });
  },

  async removeTrack(id) {
    // Drop any pending debounced write BEFORE deleting, otherwise a timer
    // that fires afterward would resurrect the just-deleted track's state.
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    await db.deleteTrack(id);
    if (get().currentTrackId === id) {
      // Reset directly (not via closeTrack) — closeTrack flushes a persist,
      // which would rewrite trackState for the id we just deleted.
      engine?.pause();
      set({ currentTrackId: null, playing: false, peaks: null, position: 0, markers: [] });
    }
    set({ library: await db.listTracks() });
  },

  closeTrack() {
    // Flush FIRST, while currentTrackId/position still hold the outgoing
    // track's values — this is what saves the leave-position.
    flushPersist();
    engine?.pause();
    set({ currentTrackId: null, playing: false, peaks: null, position: 0, markers: [] });
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

  addMarker() {
    const { position, markers } = get();
    const m: Marker = { id: uuid(), time: position, label: '' };
    set({ markers: insertMarker(markers, m) });
    persist();
  },

  removeMarker() {
    const { position, markers } = get();
    const next = removeNearestMarker(markers, position);
    if (next === markers) return; // nothing within threshold — no write
    set({ markers: next });
    persist();
  },

  seekPrevMarker() {
    const { markers, position } = get();
    const t = prevMarkerTime(markers, position);
    if (t !== null) get().seek(t);
  },

  seekNextMarker() {
    const { markers, position } = get();
    const t = nextMarkerTime(markers, position);
    if (t !== null) get().seek(t);
  },

  tick() {
    if (!engine) return;
    set({ position: engine.getCurrentTime(), playing: engine.playing });
  },

  clearError() {
    set({ error: null });
  },
}));
