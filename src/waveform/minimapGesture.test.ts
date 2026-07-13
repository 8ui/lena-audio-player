import { describe, it, expect } from 'vitest';
import {
  idleGesture,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  SLOP_PX,
  type GestureCtx,
} from './minimapGesture';

const playingAt = (position: number): GestureCtx => ({
  playing: true, position, duration: 100, width: 400,
});
const pausedAt = (position: number): GestureCtx => ({
  playing: false, position, duration: 100, width: 400,
});

const down = (x: number) => onTouchStart(idleGesture, 1, x);

describe('minimapGesture', () => {
  it('touching the strip does nothing at all (no seek, no pause)', () => {
    const { state, effects } = down(100);
    expect(effects).toEqual({});
    expect(state.activeId).toBe(1);
    expect(state.anchored).toBe(false);
  });

  it('a second finger on the strip is ignored while one is tracked', () => {
    const first = down(100).state;
    const { state, effects } = onTouchStart(first, 2, 300);
    expect(effects).toEqual({});
    expect(state).toBe(first); // untouched
  });

  it('finger tremor within the slop threshold is still a tap — no pause, no seek', () => {
    const s = down(100).state;
    const { state, effects } = onTouchMove(s, 1, 100 + SLOP_PX, playingAt(30));
    expect(effects).toEqual({});
    expect(state.anchored).toBe(false);
  });

  it('crossing the slop threshold while playing pauses and anchors at the current position', () => {
    const s = down(100).state;
    const { state, effects } = onTouchMove(s, 1, 100 + SLOP_PX + 1, playingAt(30));
    expect(effects).toEqual({ pause: true });
    expect(state.anchored).toBe(true);
    expect(state.startPos).toBe(30);
    expect(state.startX).toBe(100 + SLOP_PX + 1); // anchored AT the crossing point
    expect(state.pausedByDrag).toBe(true);
  });

  it('crossing the slop threshold while already paused anchors without pausing', () => {
    const s = down(100).state;
    const { state, effects } = onTouchMove(s, 1, 200, pausedAt(30));
    expect(effects).toEqual({});
    expect(state.anchored).toBe(true);
    expect(state.pausedByDrag).toBe(false);
  });

  it('once anchored, moving seeks relative to the anchor — right is forward', () => {
    const a = onTouchMove(down(100).state, 1, 110, playingAt(30)).state;
    // +100px from the anchor on a 400px strip over a 100s track = +25s
    const { effects } = onTouchMove(a, 1, a.startX + 100, playingAt(30));
    expect(effects.seek).toBeCloseTo(55); // startPos 30 + 25
    expect(effects.pause).toBeUndefined();
  });

  it('ignores moves from a finger it is not tracking', () => {
    const s = down(100).state;
    const { state, effects } = onTouchMove(s, 99, 300, playingAt(30));
    expect(effects).toEqual({});
    expect(state).toBe(s);
  });

  it('lifting after a real drag resumes playback', () => {
    const a = onTouchMove(down(100).state, 1, 200, playingAt(30)).state;
    const { state, effects } = onTouchEnd(a, [1]);
    expect(effects).toEqual({ resume: true });
    expect(state).toEqual(idleGesture);
  });

  it('lifting after a bare tap resumes nothing (it never paused)', () => {
    const s = down(100).state;
    const { state, effects } = onTouchEnd(s, [1]);
    expect(effects).toEqual({});
    expect(state).toEqual(idleGesture);
  });

  it('a foreign finger lifting does not clear the gesture (no dead-lock)', () => {
    const s = down(100).state;
    const { state, effects } = onTouchEnd(s, [99]);
    expect(effects).toEqual({});
    expect(state).toBe(s);
    // the real finger can still finish normally afterwards
    expect(onTouchEnd(state, [1]).state).toEqual(idleGesture);
  });

  it('a track that ends naturally mid-hold does not start playback on the drag', () => {
    // The old code cached `playing` at touchstart. If the source ended during
    // the hold, that stale `true` made the first move call togglePlay() on a
    // STOPPED engine -> playback restarted from zero, and the release then
    // paused it. Reading `playing` fresh at anchor time makes this impossible.
    const s = down(100).state; // finger goes down while playing...
    const { state, effects } = onTouchMove(s, 1, 200, pausedAt(100)); // ...track ended
    expect(effects.pause).toBeUndefined(); // nothing to pause
    expect(state.pausedByDrag).toBe(false);
    expect(onTouchEnd(state, [1]).effects).toEqual({}); // and nothing to resume
  });
});
