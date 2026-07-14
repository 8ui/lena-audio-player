import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { usePlayerStore, __setEngineFactory, __resetAudioContext } from './usePlayerStore';
import * as db from '../storage/db';
import type { AudioEngine } from '../engine/AudioEngine';
import type { TrackRecord } from '../types';

function fakeEngine(): AudioEngine {
  let playing = false;
  return {
    load: async () => {},
    play: () => { playing = true; },
    pause: () => { playing = false; },
    seek: () => {},
    setTempo: () => {},
    setPitchSemitones: () => {},
    setLoop: () => {},
    getCurrentTime: () => 0,
    getDuration: () => 100,
    get playing() { return playing; },
    dispose: () => {},
  };
}

describe('player store', () => {
  beforeEach(() => {
    __setEngineFactory(fakeEngine);
    usePlayerStore.setState({
      library: [], currentTrackId: null, peaks: null, duration: 0,
      playing: false, position: 0, tempo: 1, pitch: 0,
      loopStart: null, loopEnd: null, pxPerSec: 100, error: null, markers: [],
      trackStates: {},
    });
  });

  // Some tests below overwrite globalThis.AudioContext with a stub. Restore it
  // afterward so the mutation can't leak into unrelated tests. (The module-level
  // sharedCtx cache in the store is only ever populated by a stubbed, rejecting
  // context here — no test needs a working decode — so it needs no reset.)
  const realAudioContext = (globalThis as { AudioContext?: unknown }).AudioContext;
  afterEach(() => {
    (globalThis as { AudioContext?: unknown }).AudioContext = realAudioContext;
  });

  it('clamps tempo through setTempo', () => {
    usePlayerStore.getState().setTempo(5);
    expect(usePlayerStore.getState().tempo).toBe(1.5);
  });

  it('clamps pitch through setPitch', () => {
    usePlayerStore.getState().setPitch(-99);
    expect(usePlayerStore.getState().pitch).toBe(-12);
  });

  it('setLoopA then setLoopB records region from current position', () => {
    usePlayerStore.setState({ position: 5 });
    usePlayerStore.getState().setLoopA();
    usePlayerStore.setState({ position: 9 });
    usePlayerStore.getState().setLoopB();
    expect(usePlayerStore.getState().loopStart).toBe(5);
    expect(usePlayerStore.getState().loopEnd).toBe(9);
  });

  it('clearLoop resets region', () => {
    usePlayerStore.setState({ loopStart: 1, loopEnd: 2 });
    usePlayerStore.getState().clearLoop();
    expect(usePlayerStore.getState().loopStart).toBeNull();
  });

  it('togglePlay flips playing', () => {
    usePlayerStore.setState({ currentTrackId: 'x' });
    usePlayerStore.getState().togglePlay();
    expect(usePlayerStore.getState().playing).toBe(true);
  });

  it('flush persists latest state on close', async () => {
    usePlayerStore.setState({ currentTrackId: 'track-1', position: 42 });
    usePlayerStore.getState().setTempo(0.5); // schedules a 400ms debounced persist
    usePlayerStore.getState().closeTrack(); // must flush it synchronously first

    await vi.waitFor(async () => {
      const saved = await db.getState('track-1');
      expect(saved?.tempo).toBe(0.5);
      expect(saved?.lastPosition).toBe(42);
    });
  });

  it('removeTrack does not resurrect deleted state', async () => {
    const id = 'track-remove';
    const rec: TrackRecord = {
      id,
      name: 'doomed',
      blob: new Blob(['x']),
      peaks: new Float32Array(0),
      duration: 10,
      createdAt: Date.now(),
    };
    await db.addTrack(rec);
    await db.saveState({ ...db.defaultState(id), tempo: 1.2 });

    usePlayerStore.setState({ currentTrackId: id });
    usePlayerStore.getState().setTempo(0.7); // schedules a pending 400ms debounced persist for `id`

    // removeTrack resets currentTrackId to null when the removed track is
    // current, which makes persistNow() a no-op (it only ever writes for the
    // *live* currentTrackId) even if the underlying native timer is never
    // cancelled — so a purely behavioral wait can't distinguish "timer was
    // cleared" from "timer fired harmlessly because currentTrackId was already
    // null". Spy on the global clearTimeout to directly prove removeTrack
    // cancels the pending debounce timer, which is the exact invariant this
    // test guards.
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    await usePlayerStore.getState().removeTrack(id);
    expect(clearTimeoutSpy).toHaveBeenCalled(); // pending persist timer must be cancelled
    clearTimeoutSpy.mockRestore();

    expect(await db.getState(id)).toBeUndefined();

    // Belt-and-suspenders: also wait past the 400ms persist debounce window
    // with real timers and confirm the row is still gone (guards against any
    // other path that could resurrect it, not just the timer cancellation).
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(await db.getState(id)).toBeUndefined();
  });

  // Stub the shared AudioContext (jsdom has none) with one whose decodeAudioData
  // always rejects — simulates importing/opening an unsupported or corrupt file.
  function stubRejectingAudioContext() {
    (globalThis as { AudioContext?: unknown }).AudioContext = class {
      decodeAudioData() {
        return Promise.reject(new DOMException('bad format', 'EncodingError'));
      }
    };
  }

  it('importFile surfaces an error and does not add a track when decode fails', async () => {
    stubRejectingAudioContext();
    const file = new File([new Uint8Array([1, 2, 3])], 'broken.xyz');

    await usePlayerStore.getState().importFile(file);

    expect(usePlayerStore.getState().error).toBeTruthy();
    expect(usePlayerStore.getState().library).toHaveLength(0);
  });

  it('openTrack surfaces an error and stays in the library when decode fails', async () => {
    stubRejectingAudioContext();
    const id = 'track-corrupt';
    const rec: TrackRecord = {
      id,
      name: 'corrupt',
      blob: new Blob([new Uint8Array([1, 2, 3])]),
      peaks: new Float32Array(0),
      duration: 10,
      createdAt: Date.now(),
    };
    // Serve the record straight from the mock so rec.blob keeps its
    // arrayBuffer() method (a fake-indexeddb round-trip drops it) — the point
    // of this test is the decode rejection, not blob retrieval.
    const spy = vi.spyOn(db, 'getTrack').mockResolvedValue(rec);

    await usePlayerStore.getState().openTrack(id);

    expect(usePlayerStore.getState().error).toBeTruthy();
    expect(usePlayerStore.getState().currentTrackId).toBeNull();
    spy.mockRestore();
  });

  it('clearError resets the error', () => {
    usePlayerStore.setState({ error: 'boom' });
    usePlayerStore.getState().clearError();
    expect(usePlayerStore.getState().error).toBeNull();
  });

  it('addMarker places a marker at the current position and labels it', () => {
    usePlayerStore.setState({ position: 5, markers: [] });
    usePlayerStore.getState().addMarker();
    const { markers } = usePlayerStore.getState();
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(5);
    expect(markers[0].label).toBe('1');
  });

  it('addMarker ids come from uuid(), which survives a non-secure origin', () => {
    // Pins the call site: a raw crypto.randomUUID() here would throw on the
    // phone (plain-HTTP LAN origin is not a secure context) — the crash that
    // was actually hit on device. Simulate that origin by removing the method.
    const real = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined, configurable: true, writable: true,
    });
    try {
      usePlayerStore.setState({ position: 1, markers: [] });
      usePlayerStore.getState().addMarker();
      expect(usePlayerStore.getState().markers[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: real, configurable: true, writable: true,
      });
    }
  });

  it('addMarker keeps markers sorted and relabeled', () => {
    usePlayerStore.setState({ markers: [] });
    usePlayerStore.setState({ position: 9 });
    usePlayerStore.getState().addMarker();
    usePlayerStore.setState({ position: 3 });
    usePlayerStore.getState().addMarker();
    expect(usePlayerStore.getState().markers.map((m) => [m.time, m.label])).toEqual([
      [3, '1'],
      [9, '2'],
    ]);
  });

  it('removeMarker drops the marker nearest the playhead', () => {
    usePlayerStore.setState({
      markers: [
        { id: 'a', time: 2, label: '1' },
        { id: 'b', time: 8, label: '2' },
      ],
      position: 8.2,
    });
    usePlayerStore.getState().removeMarker();
    expect(usePlayerStore.getState().markers.map((m) => m.time)).toEqual([2]);
  });

  it('seekNextMarker seeks to the next marker after position', () => {
    usePlayerStore.setState({
      markers: [
        { id: 'a', time: 2, label: '1' },
        { id: 'b', time: 8, label: '2' },
      ],
      position: 3,
    });
    usePlayerStore.getState().seekNextMarker();
    expect(usePlayerStore.getState().position).toBe(8);
  });

  it('seekPrevMarker is a no-op when no marker precedes position', () => {
    usePlayerStore.setState({
      markers: [{ id: 'a', time: 8, label: '1' }],
      position: 3,
    });
    usePlayerStore.getState().seekPrevMarker();
    expect(usePlayerStore.getState().position).toBe(3);
  });

  it('init loads the saved state of every track, keyed by id', async () => {
    const rec: TrackRecord = {
      id: 'x', name: 'X', blob: new Blob(), peaks: new Float32Array(),
      duration: 100, createdAt: 1,
    };
    await db.addTrack(rec);
    await db.saveState({ ...db.defaultState('x'), lastPosition: 42, tempo: 0.8 });

    await usePlayerStore.getState().init();

    const { trackStates } = usePlayerStore.getState();
    expect(trackStates['x'].lastPosition).toBe(42);
    expect(trackStates['x'].tempo).toBe(0.8);
  });

  // The list shows "where did I stop". If closeTrack only flushed to IndexedDB,
  // the card would still show the position from when the track was OPENED until
  // the next full init() — i.e. until the app restarts.
  it('closeTrack publishes the outgoing position into trackStates', () => {
    usePlayerStore.setState({ currentTrackId: 'x', position: 55, tempo: 0.9, pitch: -2 });

    usePlayerStore.getState().closeTrack();

    const { trackStates, currentTrackId } = usePlayerStore.getState();
    expect(currentTrackId).toBeNull();
    expect(trackStates['x'].lastPosition).toBe(55);
    expect(trackStates['x'].tempo).toBe(0.9);
    expect(trackStates['x'].pitch).toBe(-2);
  });

  it('removeTrack drops the track state from the map', async () => {
    const rec: TrackRecord = {
      id: 'x', name: 'X', blob: new Blob(), peaks: new Float32Array(),
      duration: 100, createdAt: 1,
    };
    await db.addTrack(rec);
    usePlayerStore.setState({ trackStates: { x: db.defaultState('x') } });

    await usePlayerStore.getState().removeTrack('x');

    expect(usePlayerStore.getState().trackStates['x']).toBeUndefined();
  });

  // A quota overflow (a big file on a full phone) rejects inside db.addTrack
  // with nobody catching it: the import silently does nothing and the user is
  // told nothing.
  it('importFile surfaces a storage failure in the error banner', async () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = class {
      decodeAudioData = vi.fn().mockResolvedValue({
        duration: 1,
        sampleRate: 44100,
        getChannelData: () => new Float32Array(44100),
      });
    };
    // The store caches its AudioContext in a module-level `sharedCtx`, and the
    // decode-failure test above populates it with a REJECTING stub. Without this
    // reset, whether this test sees a working decode depends on test order.
    __resetAudioContext();

    const addTrack = vi.spyOn(db, 'addTrack').mockRejectedValue(new Error('quota'));

    await usePlayerStore.getState().importFile(new File([new ArrayBuffer(8)], 'a.mp3'));

    expect(usePlayerStore.getState().error).toMatch(/место/i);
    expect(usePlayerStore.getState().library).toEqual([]);

    addTrack.mockRestore();
    __resetAudioContext(); // don't leave the working stub cached for the next test
  });
});
