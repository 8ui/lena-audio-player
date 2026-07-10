import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { addTrack, listTracks, getTrack, deleteTrack, getState, saveState, defaultState } from './db';
import type { TrackRecord } from '../types';

function makeTrack(id: string): TrackRecord {
  return {
    id, name: `t-${id}`, blob: new Blob(['x']),
    peaks: new Float32Array([0, 1]), duration: 42, createdAt: 1,
  };
}

describe('storage', () => {
  beforeEach(async () => {
    for (const t of await listTracks()) await deleteTrack(t.id);
  });

  it('adds and lists tracks', async () => {
    await addTrack(makeTrack('a'));
    const all = await listTracks();
    expect(all.map((t) => t.id)).toContain('a');
  });

  it('gets a track by id', async () => {
    await addTrack(makeTrack('b'));
    const t = await getTrack('b');
    expect(t?.duration).toBe(42);
  });

  it('saves and restores state', async () => {
    const s = { ...defaultState('c'), tempo: 0.5, pitch: -3 };
    await saveState(s);
    expect((await getState('c'))?.tempo).toBe(0.5);
  });

  it('deleteTrack removes track and its state', async () => {
    await addTrack(makeTrack('d'));
    await saveState(defaultState('d'));
    await deleteTrack('d');
    expect(await getTrack('d')).toBeUndefined();
    expect(await getState('d')).toBeUndefined();
  });
});
