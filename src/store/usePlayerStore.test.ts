import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { usePlayerStore, __setEngineFactory } from './usePlayerStore';
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
      loopStart: null, loopEnd: null, pxPerSec: 100,
    });
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
    usePlayerStore.getState().setTempo(0.8); // schedules a pending persist for `id`

    await usePlayerStore.getState().removeTrack(id);
    expect(await db.getState(id)).toBeUndefined();

    // Prove the (dropped) pending timer never fires and rewrites it later.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await db.getState(id)).toBeUndefined();
  });
});
