export interface Marker {
  id: string;
  time: number;
  label: string;
}

export interface TrackRecord {
  id: string;
  name: string;
  blob: Blob;
  peaks: Float32Array;
  duration: number;
  createdAt: number;
}

export interface TrackStateRecord {
  trackId: string;
  tempo: number;
  pitch: number;
  loopStart: number | null;
  loopEnd: number | null;
  pxPerSec: number;
  markers: Marker[];
  lastPosition: number;
}
