import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TrackRecord, TrackStateRecord } from '../types';
import { TEMPO_DEFAULT } from '../engine/params';
import { PX_PER_SEC_DEFAULT } from '../waveform/viewport';

interface PlayerDB extends DBSchema {
  tracks: { key: string; value: TrackRecord };
  trackState: { key: string; value: TrackStateRecord };
}

let dbp: Promise<IDBPDatabase<PlayerDB>> | null = null;

function db(): Promise<IDBPDatabase<PlayerDB>> {
  if (!dbp) {
    dbp = openDB<PlayerDB>('lena-player', 1, {
      upgrade(d) {
        d.createObjectStore('tracks', { keyPath: 'id' });
        d.createObjectStore('trackState', { keyPath: 'trackId' });
      },
    });
  }
  return dbp;
}

export function defaultState(trackId: string): TrackStateRecord {
  return {
    trackId,
    tempo: TEMPO_DEFAULT,
    pitch: 0,
    loopStart: null,
    loopEnd: null,
    pxPerSec: PX_PER_SEC_DEFAULT,
    markers: [],
    lastPosition: 0,
  };
}

export async function addTrack(t: TrackRecord): Promise<void> {
  await (await db()).put('tracks', t);
}

export async function listTracks(): Promise<TrackRecord[]> {
  return (await db()).getAll('tracks');
}

export async function getTrack(id: string): Promise<TrackRecord | undefined> {
  return (await db()).get('tracks', id);
}

export async function deleteTrack(id: string): Promise<void> {
  const d = await db();
  await d.delete('tracks', id);
  await d.delete('trackState', id);
}

export async function getState(trackId: string): Promise<TrackStateRecord | undefined> {
  return (await db()).get('trackState', trackId);
}

// The library screen needs every track's state at once (to show where the user
// stopped) — getState(trackId) is one id at a time.
export async function listStates(): Promise<TrackStateRecord[]> {
  return (await db()).getAll('trackState');
}

export async function saveState(s: TrackStateRecord): Promise<void> {
  await (await db()).put('trackState', s);
}
