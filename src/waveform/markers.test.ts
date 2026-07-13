import { describe, it, expect } from 'vitest';
import {
  relabel,
  insertMarker,
  removeNearestMarker,
  nextMarkerTime,
  prevMarkerTime,
} from './markers';
import type { Marker } from '../types';

const mk = (time: number, id = `id-${time}`, label = ''): Marker => ({ id, time, label });

describe('markers', () => {
  it('relabel sorts by time and numbers 1..N', () => {
    const out = relabel([mk(9), mk(2), mk(5)]);
    expect(out.map((m) => [m.time, m.label])).toEqual([
      [2, '1'],
      [5, '2'],
      [9, '3'],
    ]);
  });

  it('insertMarker adds and re-sorts+relabels', () => {
    const out = insertMarker([mk(2), mk(9)], mk(5));
    expect(out.map((m) => m.time)).toEqual([2, 5, 9]);
    expect(out.map((m) => m.label)).toEqual(['1', '2', '3']);
  });

  it('removeNearestMarker removes the closest within threshold and relabels', () => {
    const out = removeNearestMarker([mk(2), mk(5), mk(9)], 5.3);
    expect(out.map((m) => m.time)).toEqual([2, 9]);
    expect(out.map((m) => m.label)).toEqual(['1', '2']);
  });

  it('removeNearestMarker is a no-op when nothing is within threshold', () => {
    const input = [mk(2), mk(9)];
    expect(removeNearestMarker(input, 5)).toBe(input); // 3s away > 1s threshold
  });

  it('removeNearestMarker on empty is a no-op', () => {
    const input: Marker[] = [];
    expect(removeNearestMarker(input, 5)).toBe(input);
  });

  it('nextMarkerTime returns nearest strictly after, else null', () => {
    expect(nextMarkerTime([mk(2), mk(5), mk(9)], 5)).toBe(9);
    expect(nextMarkerTime([mk(2), mk(5)], 5)).toBeNull();
  });

  it('prevMarkerTime returns nearest strictly before, else null', () => {
    expect(prevMarkerTime([mk(2), mk(5), mk(9)], 5)).toBe(2);
    expect(prevMarkerTime([mk(2), mk(5)], 2)).toBeNull();
  });
});
