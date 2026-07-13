# Relative minimap scrub + kill iOS long-press callout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Revised after plan-review.** The first draft cached `wasPlaying` at touchstart (goes stale across a natural track end → the drag would *start* playback from zero and the release would pause it), anchored on the *first* touchmove with no slop threshold (real fingers tremble 1-2px during a tap → pause+source-restart on nearly every tap, i.e. the exact glitch it claimed to avoid), and let the relative mapper fall back to `0` (which would yank the playhead to the start of the track on a degenerate width). All three are fixed below. The gesture state machine is also extracted into a **pure reducer** — this is its second rewrite and both had HIGH bugs, so the surface that keeps regressing becomes the project's established TDD surface.

**Goal:** (1) Мини-карта скрабится **относительно** — тап не перебрасывает курсор. (2) На iOS долгое нажатие больше не открывает контекстное меню и не подсвечивает выделение.

**Architecture:** Вся логика жеста мини-карты — **чистый редьюсер** `waveform/minimapGesture.ts` (`onTouchStart`/`onTouchMove`/`onTouchEnd` → `{state, effects}`), покрытый unit-тестами; `MiniMap.tsx` становится тонким адаптером «DOM-событие → редьюсер → применить эффекты к стору». Относительный маппинг — чистая `overviewDragToTime` в `viewport.ts`. Callout/выделение снимаются CSS на `body`.

**Tech Stack:** React 19, TS 7, Canvas 2D, Vitest 4. Без новых зависимостей.

## Global Constraints

- **Голый тап = полный no-op**: позиция не меняется, звук не рестартует. Дрожание пальца в пределах `SLOP_PX` — всё ещё тап.
- Палец вправо → позиция растёт (вперёд). Курсор едет за пальцем; лента статична. (Большая волна инвертирована намеренно: там тянут *ленту*, здесь — *курсор*. Это пара «контент/скроллбар», не рассогласование.)
- Жест трекает `Touch.identifier`. `e.touches.length` — ЗАПРЕЩЁН: он считает пальцы по всему экрану, а не по этому canvas.
- **`playing` НИКОГДА не кешируется на touchstart** — только читается свежим в момент якоря. Иначе натуральный конец трека во время удержания инвертирует состояние.
- Пур-логика — тест-первый. Canvas — сборка + устройство.
- `MiniMap` не зовёт `store.tick()`.

---

## Task 1: CSS — kill the iOS callout, selection and tap flash

*(First: independent, zero-risk, cannot regress.)*

**Files:**
- Modify: `src/ui/styles.css`

- [ ] **Step 1: Extend the `body` rule**

`-webkit-touch-callout` and `user-select` are inherited, so `body` is the right
place — the canvases need no rule of their own.

```css
body { margin: 0; font-family: system-ui, sans-serif; background: #12141a; color: #eee;
  /* Touch-only app: a long-press must never raise iOS's copy/share callout,
     nothing here is text to select, and taps must not flash grey (buttons
     already give feedback via button:active below). */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent; }
```

- [ ] **Step 2: Exempt form controls**

Inherited `user-select: none` has historically broken the caret/selection inside
`<input>`/`<textarea>` on iOS Safari. Nothing breaks today (only `type="file"` and
`type="range"` exist), but marker-label editing is the obvious next feature.

```css
input, textarea { -webkit-user-select: auto; user-select: auto; }
```

- [ ] **Step 3: Build (CSS is covered by neither tsc nor tests)**

Run: `npx vite build`
Expected: succeeds.

---

## Task 2: `overviewDragToTime` (pure)

**Files:**
- Modify: `src/waveform/viewport.ts`
- Test: `src/waveform/viewport.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function overviewDragToTime(
    startTime: number, deltaXpx: number, duration: number, width: number,
  ): number;   // clamped 0..duration; returns startTime on degenerate input
  ```

- [ ] **Step 1: Write the failing tests — append to `src/waveform/viewport.test.ts`**

Add `overviewDragToTime` to the existing import, then append:

```ts
describe('overviewDragToTime (relative minimap scrub)', () => {
  it('does not move at all when the finger has not moved', () => {
    expect(overviewDragToTime(42, 0, 100, 400)).toBe(42);
  });

  it('dragging right moves forward through the track', () => {
    // +100px of a 400px strip = a quarter of a 100s track = +25s
    expect(overviewDragToTime(10, 100, 100, 400)).toBeCloseTo(35);
  });

  it('dragging left moves backward through the track', () => {
    expect(overviewDragToTime(50, -100, 100, 400)).toBeCloseTo(25);
  });

  it('clamps to 0..duration', () => {
    expect(overviewDragToTime(10, -9999, 100, 400)).toBe(0);
    expect(overviewDragToTime(90, 9999, 100, 400)).toBe(100);
  });

  it('falls back to the start position on degenerate width/duration', () => {
    // A relative mapper must NOT collapse to 0 here: seek() is called with the
    // result unconditionally, so returning 0 would yank the playhead to the
    // start of the track. Standing still is the safe no-op.
    expect(overviewDragToTime(10, 50, 0, 400)).toBe(10);
    expect(overviewDragToTime(10, 50, 100, 0)).toBe(10);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/waveform/viewport.test.ts`
Expected: FAIL (not exported).

- [ ] **Step 3: Implement — append to `src/waveform/viewport.ts`**

```ts
// Relative scrub on the minimap: the playhead does NOT jump to where you tap
// (on a 48px strip a 3mm miss is ~20s — you lose your place). It stays put and
// then moves BY the finger's delta, mapped onto the whole track. Finger right
// => later (the cursor follows the finger; the strip is static, unlike the main
// waveform where the wave itself is dragged).
//
// On a degenerate width/duration this returns startTime, NOT 0 — the caller
// seeks to the result unconditionally, and 0 would mean "jump to the start".
export const overviewDragToTime = (
  startTime: number,
  deltaXpx: number,
  duration: number,
  width: number,
): number => {
  if (width <= 0 || duration <= 0) return startTime;
  return Math.min(duration, Math.max(0, startTime + (deltaXpx / width) * duration));
};
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/waveform/viewport.test.ts`
Expected: PASS (existing 9 + 5 new).

---

## Task 3: `minimapGesture.ts` — the gesture state machine as a pure reducer

**Files:**
- Create: `src/waveform/minimapGesture.ts`
- Test: `src/waveform/minimapGesture.test.ts`

**Why pure:** this handler is on its second rewrite and each version shipped a
HIGH bug (a dead-lock, then a stale-`playing` inversion). Every one of those bugs
is pure logic — identifier matching, ordering, thresholds, a state race — and
none of it needs a canvas. Extracting it moves the regression-prone surface onto
the project's existing TDD surface.

**Interfaces:**
- Consumes: `overviewDragToTime` (Task 2).
- Produces:
  ```ts
  const SLOP_PX: number;                     // 6
  interface GestureState { activeId: number | null; downX: number; anchored: boolean;
                           startX: number; startPos: number; pausedByDrag: boolean }
  interface GestureCtx   { playing: boolean; position: number; duration: number; width: number }
  interface GestureEffects { pause?: true; resume?: true; seek?: number }
  const idleGesture: GestureState;
  function onTouchStart(s: GestureState, id: number, x: number): { state: GestureState; effects: GestureEffects };
  function onTouchMove (s: GestureState, id: number, x: number, ctx: GestureCtx): { state: GestureState; effects: GestureEffects };
  function onTouchEnd  (s: GestureState, endedIds: number[]): { state: GestureState; effects: GestureEffects };
  ```
- Consumed by `MiniMap` (Task 4).

- [ ] **Step 1: Write the failing tests `src/waveform/minimapGesture.test.ts`**

```ts
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

// Drive a touch down at x, then a move to x2, returning the final state+effects.
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
    // MiniMap only receives events for touches that started on it, but a stray
    // touchend must never reset — nor must it strand activeId forever.
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
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/waveform/minimapGesture.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/waveform/minimapGesture.ts`**

```ts
import { overviewDragToTime } from './viewport';

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

type Step = { state: GestureState; effects: GestureEffects };

// Touching the strip must do NOTHING: no seek (the playhead does not jump to
// where you tapped) and no pause (pausing here would tear down and rebuild the
// audio source on every tap). We only remember who is touching and where.
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
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/waveform/minimapGesture.test.ts`
Expected: PASS (11 tests).

---

## Task 4: MiniMap — thin adapter over the reducer

**Files:**
- Modify: `src/waveform/MiniMap.tsx`

**Interfaces:**
- Consumes: Task 3 reducer. `overviewXToTime` is no longer used here — it must be
  dropped from the import or `tsc` fails (`noUnusedLocals: true`). It stays
  exported from `viewport.ts` (still tested, still the natural inverse of
  `overviewTimeToX`).

- [ ] **Step 1: Replace the gesture `useEffect` in `src/waveform/MiniMap.tsx`**

Replace the whole existing gesture effect with:

```tsx
  // Gestures: RELATIVE scrub, driven by the pure reducer in ./minimapGesture.
  // Touching the strip changes nothing — the playhead stays put and then moves
  // BY the finger's delta (finger right => forward). Absolute "jump to where you
  // tapped" was unusable: on a 48px strip a 3mm miss threw you ~20s away.
  //
  // All the logic lives in the reducer so it can be unit-tested without a canvas
  // (identifier matching, the slop threshold, anchor-after-pause ordering, the
  // natural-end race) — every bug this handler has ever shipped was one of those.
  // This effect is only the DOM adapter: event -> reducer -> apply effects.
  useEffect(() => {
    const canvas = canvasRef.current!;
    let g: GestureState = idleGesture;

    const apply = (effects: GestureEffects) => {
      const s = store.getState();
      if (effects.pause || effects.resume) s.togglePlay();
      if (effects.seek !== undefined) s.seek(effects.seek);
    };

    const ctx = (): GestureCtx => {
      const s = store.getState();
      return {
        playing: s.playing,
        position: s.position,
        duration: s.duration,
        width: canvas.getBoundingClientRect().width,
      };
    };

    const ids = (list: TouchList): number[] => {
      const out: number[] = [];
      for (let i = 0; i < list.length; i++) out.push(list[i].identifier);
      return out;
    };
    const find = (list: TouchList, id: number | null): Touch | null => {
      if (id === null) return null;
      for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    };

    const onStart = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const step = onTouchStart(g, t.identifier, t.clientX);
      g = step.state;
      apply(step.effects);
    };

    const onMove = (e: TouchEvent) => {
      const t = find(e.touches, g.activeId);
      if (!t) return;
      e.preventDefault();
      const step = onTouchMove(g, t.identifier, t.clientX, ctx());
      g = step.state;
      apply(step.effects);
    };

    const onEnd = (e: TouchEvent) => {
      const step = onTouchEnd(g, ids(e.changedTouches));
      g = step.state;
      apply(step.effects);
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onEnd);
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onEnd);
    };
  }, [store]);
```

- [ ] **Step 2: Fix the imports at the top of `MiniMap.tsx`**

```tsx
import { overviewTimeToX } from './viewport';
import { downsamplePeaks } from './computePeaks';
import {
  idleGesture,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  type GestureState,
  type GestureCtx,
  type GestureEffects,
} from './minimapGesture';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no unused `overviewXToTime`).

---

## Task 5: WaveformCanvas — stop counting other canvases' fingers

Found by plan-review. Pre-existing, but the relative scrub makes long holds on the
strip normal, so it will now fire routinely — and the manual test below would
otherwise silently "pass" while the waveform zooms behind your back.

**Files:**
- Modify: `src/waveform/WaveformCanvas.tsx`

- [ ] **Step 1: Use `e.targetTouches` instead of `e.touches`**

`e.touches` counts **every** finger on the screen. A finger held on the MiniMap
plus a finger landing on the waveform makes `e.touches.length === 2` → the
waveform enters `pinch` mode and computes `pinchStartDist` between a minimap
finger and a waveform finger → any further movement **zooms `pxPerSec`**.
`e.targetTouches` only contains touches that started on this element.

In `onStart`, `onMove` and `onEnd`, replace every `e.touches` with
`e.targetTouches` (including the `dist(e.touches)` calls), leaving the logic
otherwise identical.

- [ ] **Step 2: Handle `touchcancel`**

`WaveformCanvas` registers `touchstart/touchmove/touchend` but not `touchcancel`,
so a cancelled pan leaves `mode = 'pan'` and `wasPlaying = true` — playback stays
paused forever. Register `onEnd` for `touchcancel` too, and remove it in cleanup:

```ts
    canvas.addEventListener('touchcancel', onEnd);
    // ...and in the cleanup:
    canvas.removeEventListener('touchcancel', onEnd);
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npx vite build`
Expected: clean.

---

## Task 6: Docs + full verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the waveform/touch notes in `CLAUDE.md`**

The "Waveform viewport" section still describes the minimap's old absolute
tap-to-seek. Replace the minimap sentence with:

```md
The **minimap** scrubs *relatively*: touching it does nothing, and the playhead
then moves by the finger's delta (finger right = forward), with a `SLOP_PX`
dead-zone so a bare tap is a complete no-op. Its gesture state machine is a pure
reducer (`waveform/minimapGesture.ts`) and is unit-tested; the canvas is only a
DOM adapter. Touch handlers on either canvas must use `e.targetTouches` (fingers
that started on *this* element), never `e.touches` (every finger on the screen).
```

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit && npm test && npx vite build`
Expected: type-clean, all tests pass, build succeeds.

- [ ] **Step 3: Manual verify — REQUIRES a touch device**

- [ ] Tap the minimap and lift without moving → **nothing happens**: playhead does not move, audio does not stutter or restart.
- [ ] Touch and drag right → playhead moves **forward from where it was**, tracking the finger; left → backward.
- [ ] Release → playback resumes if it was playing, at the scrubbed position.
- [ ] Long-press the minimap or the big waveform → **no context menu, no selection highlight**.
- [ ] Hold a finger on the minimap, then touch the big waveform → the waveform must **not** zoom (Task 5).
- [ ] Start a minimap drag, put a second finger on the waveform, lift both → the strip still responds.
- [ ] Let the track play to its natural end while holding a finger on the strip, then drag → playback must **not** jump back to the start (the stale-`playing` bug).

---

## Self-Review

**Plan-review findings, all folded in:**
- HIGH stale `wasPlaying` across a natural end → variable deleted; `playing` is read fresh at anchor (Task 3, pinned by a test).
- HIGH no slop threshold → `SLOP_PX = 6` dead-zone; a trembling tap stays a tap (Task 3, pinned).
- MED relative mapper falling back to `0` → falls back to `startTime` (Task 2, pinned).
- MED cross-canvas false pinch + missing `touchcancel` in `WaveformCanvas` → Task 5.
- LOW form controls exempted from `user-select: none` → Task 1 Step 2.
- LOW `CLAUDE.md` staleness → Task 6.
- Reviewer's architectural call (extract a pure reducer, since both prior versions of this handler shipped HIGH bugs) → Task 3.
- Reviewer's ordering call (CSS first, it cannot regress) → Task 1.

**Known limitation (accepted, → debt):** with an A-B loop active, releasing a scrub
that landed outside `[A,B]` snaps the playhead back into the loop region
(`position.ts` wraps into the loop). Pre-existing; the absolute scrub had it too.

**Placeholder scan:** none.

**Type consistency:** `overviewDragToTime(startTime, deltaXpx, duration, width)` identical in Tasks 2/3. Reducer signatures identical in Tasks 3/4. Store fields used (`playing`, `position`, `duration`, `seek`, `togglePlay`) all exist.

**Commits note:** actual `git commit` runs only after the user approves.
