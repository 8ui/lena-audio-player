import { describe, it, expect } from 'vitest';
import { sortTracks, progressRatio, tempoBadge, pitchBadge, loopBadge } from './libraryModel';
import type { TrackRecord } from '../types';

function track(id: string, createdAt: number): TrackRecord {
  return {
    id,
    name: id,
    blob: new Blob(),
    peaks: new Float32Array(),
    duration: 60,
    createdAt,
  };
}

describe('sortTracks', () => {
  // db.listTracks() is a bare getAll(): it returns key order, not any order a
  // human asked for. Newest first is the order the screen promises.
  it('puts the newest track first', () => {
    const sorted = sortTracks([track('old', 1), track('new', 3), track('mid', 2)]);
    expect(sorted.map((t) => t.id)).toEqual(['new', 'mid', 'old']);
  });

  it('does not mutate the input array', () => {
    const input = [track('old', 1), track('new', 3)];
    sortTracks(input);
    expect(input.map((t) => t.id)).toEqual(['old', 'new']);
  });
});

describe('progressRatio', () => {
  it('is the fraction of the track already played', () => {
    expect(progressRatio(30, 120)).toBe(0.25);
  });

  it('is 0 for a track that was never opened', () => {
    expect(progressRatio(0, 120)).toBe(0);
  });

  // A zero duration would otherwise produce NaN or Infinity and blow up the
  // SVG geometry of every bar in the card.
  it('is 0 for a zero duration instead of NaN', () => {
    expect(progressRatio(10, 0)).toBe(0);
  });

  it('clamps a position past the end to 1', () => {
    expect(progressRatio(200, 120)).toBe(1);
  });
});

describe('tempoBadge', () => {
  it('is null at the default tempo — the card shows nothing', () => {
    expect(tempoBadge(1)).toBeNull();
  });

  it('shows a rounded percentage when the tempo was changed', () => {
    expect(tempoBadge(0.9)).toBe('90%');
    expect(tempoBadge(1.25)).toBe('125%');
  });
});

describe('pitchBadge', () => {
  it('is null at the default pitch', () => {
    expect(pitchBadge(0)).toBeNull();
  });

  it('signs the semitones, using a real minus sign', () => {
    expect(pitchBadge(2)).toBe('+2');
    expect(pitchBadge(-2)).toBe('−2'); // U+2212, not a hyphen
  });
});

describe('loopBadge', () => {
  it('is null when no loop is set', () => {
    expect(loopBadge(null, null)).toBeNull();
    expect(loopBadge(3, null)).toBeNull();
  });

  it('marks a real A-B region', () => {
    expect(loopBadge(3, 9)).toBe('A–B');
  });

  // Matches the engine and the minimap: a loop only counts when B is past A.
  it('is null for an inverted or empty region', () => {
    expect(loopBadge(9, 3)).toBeNull();
    expect(loopBadge(5, 5)).toBeNull();
  });
});
