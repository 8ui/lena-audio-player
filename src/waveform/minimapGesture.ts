import { overviewDragToTime } from './viewport';

// The minimap gesture state machine, kept PURE so it can be unit-tested without
// a canvas. This handler is on its second rewrite and each previous version
// shipped a HIGH bug — a dead-lock, then a stale-`playing` inversion — and every
// one of those bugs was pure logic: identifier matching, ordering, a threshold,
// a state race. None of it needs a DOM. MiniMap.tsx is only the adapter.

// A tap is never perfectly still — a finger trembles a pixel or two. Anything
// inside this radius is still a tap, so it must not pause, seek, or restart the
// audio source. Only crossing it turns the gesture into a scrub.
export const SLOP_PX = 6;

export interface GestureState {
  activeId: number | null;
  downX: number;
  anchored: boolean;
  startX: number;
  startPos: number;
  pausedByDrag: boolean;
}

// Everything the reducer needs to know about the world, passed in so it stays pure.
export interface GestureCtx {
  playing: boolean;
  position: number;
  duration: number;
  width: number; // CSS px width of the strip
}

export interface GestureEffects {
  pause?: true;
  resume?: true;
  seek?: number;
}

export const idleGesture: GestureState = {
  activeId: null,
  downX: 0,
  anchored: false,
  startX: 0,
  startPos: 0,
  pausedByDrag: false,
};

interface Step {
  state: GestureState;
  effects: GestureEffects;
}

// Touching the strip must do NOTHING: no seek (the playhead does not jump to
// where you tapped — on a 48px strip a 3mm miss is ~20s and you lose your place)
// and no pause (pausing here would tear down and rebuild the audio source on
// every tap). We only remember who is touching and where.
export function onTouchStart(s: GestureState, id: number, x: number): Step {
  if (s.activeId !== null) return { state: s, effects: {} }; // one finger owns the strip
  return { state: { ...idleGesture, activeId: id, downX: x }, effects: {} };
}

export function onTouchMove(s: GestureState, id: number, x: number, ctx: GestureCtx): Step {
  if (s.activeId !== id) return { state: s, effects: {} };

  if (!s.anchored) {
    if (Math.abs(x - s.downX) <= SLOP_PX) return { state: s, effects: {} }; // still a tap

    // Crossing the threshold turns this into a scrub. Read `playing` FRESH here,
    // never a value cached at touchstart: the track may have ended naturally
    // during the hold, and acting on a stale `true` would restart playback from
    // zero and leave the release inverted.
    const pausedByDrag = ctx.playing;
    return {
      state: {
        ...s,
        anchored: true,
        startX: x, // anchor AT the crossing point, so the playhead does not
        startPos: ctx.position, // lurch by SLOP_PX worth of track time
        pausedByDrag,
      },
      effects: pausedByDrag ? { pause: true } : {},
    };
  }

  return {
    state: s,
    effects: { seek: overviewDragToTime(s.startPos, x - s.startX, ctx.duration, ctx.width) },
  };
}

export function onTouchEnd(s: GestureState, endedIds: number[]): Step {
  if (s.activeId === null || !endedIds.includes(s.activeId)) return { state: s, effects: {} };
  return { state: idleGesture, effects: s.pausedByDrag ? { resume: true } : {} };
}
