import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { usePlayerStore, __setEngineFactory } from './usePlayerStore';
import type { AudioEngine } from '../engine/AudioEngine';

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
});
