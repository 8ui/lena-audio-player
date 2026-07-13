# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Разбор" — a touch-first PWA for slowing down / transposing / A-B-looping audio
tracks (e.g. for musicians learning a part by ear). Local-only: files are
imported from the device, decoded once, and everything (audio blob, waveform
peaks, per-track player state) is persisted in IndexedDB. No backend.

Stack: React 19 + TypeScript (native "tsgo" compiler, TS 7) + Vite 8 +
Zustand 5 + Web Audio (`@soundtouchjs/audio-worklet`) + `idb` + Vitest 4 +
`vite-plugin-pwa`. Single package, no monorepo.

## Commands

```bash
npm run dev       # vite dev server
npm run build     # vite build (bundles with esbuild; does NOT type-check)
npm run preview   # serve the production build locally
npm test          # vitest run (all tests, once)
npm run test:watch  # vitest watch mode
npx vitest run <path>   # single test file, e.g. src/engine/position.test.ts
npx tsc --noEmit  # type-check only, no build output (separate step from build)
```

Currently 12 test files / 62 tests, all passing. **Note:** Type-checking is not part of the build pipeline — run `npx tsc --noEmit` separately if you want to verify types before bundling (esbuild strips types, so `vite build` alone does not catch type errors).

## Architecture

Five layers, each one only talks to the layer directly below it:

1. **UI** (`src/screens/*`, `src/ui/*`, `src/App.tsx`) — React components.
   `App.tsx` switches between `Library` (import/pick a track) and `Player`
   (transport, tempo/pitch/loop controls, waveform) based on
   `currentTrackId`. Components read/act on the store only — never touch the
   engine or IndexedDB directly.
2. **Store** (`src/store/usePlayerStore.ts`) — a single Zustand store that is
   the sole owner of the `AudioEngine` instance and the sole writer to
   IndexedDB. All UI actions (`togglePlay`, `seek`, `setTempo`, `setPitch`,
   `setLoopA/B`, `clearLoop`, `setPxPerSec`) go through it. `tick()` polls the
   engine's clock into `position`/`playing` state (driven from
   `WaveformCanvas`'s rAF loop, not a separate timer).
3. **Engine** (`src/engine/AudioEngine.ts` interface,
   `src/engine/SoundTouchEngine.ts` implementation) — all playback is behind
   the `AudioEngine` interface so the concrete engine is swappable. MVP ships
   only `SoundTouchEngine` (Web Audio + the SoundTouch AudioWorklet); a
   Rubberband-based engine is a deliberate future swap, out of scope for MVP.
4. **Waveform** (`src/waveform/*`) — `computePeaks` reduces a decoded channel
   to min/max buckets (200 buckets/sec, see `PEAKS_RESOLUTION`) once at
   import time; `viewport.ts` has the pure time↔pixel math; `WaveformCanvas`
   is the imperative `<canvas>` renderer + touch gesture handler.
   `MiniMap.tsx` is a second canvas (48px strip under the main waveform)
   showing the *whole* track — playhead, loop, markers — with a *relative* scrub.
   It runs its own rAF loop but deliberately does **not** call `store.tick()`:
   `WaveformCanvas` is the sole ticker (two tickers would double-poll the
   engine clock). It downsamples the full-track peaks to one column per pixel
   (`downsamplePeaks`) and caches that array — walking tens of thousands of
   buckets every frame is the thing to avoid; stroking ~`width` segments is
   cheap. `markers.ts` holds the pure marker math (sort/relabel/nearest).
5. **Storage** (`src/storage/db.ts`) — thin `idb` wrapper, two object stores:
   `tracks` (blob + peaks + duration, keyed by id) and `trackState` (tempo,
   pitch, loop, pxPerSec, markers, lastPosition, keyed by trackId).

Plus a thin **PWA shell**: `src/pwa/wakeLock.ts` (screen wake lock while
playing) and `vite-plugin-pwa` (manifest + service worker, configured in
`vite.config.ts`) for offline/installable behavior.

### What's tested vs. what's manually verified

The **pure-math modules** are the TDD surface and have real unit tests:
`engine/params.ts` (clamps), `engine/position.ts` (`currentSourceTime`),
`waveform/viewport.ts`, `waveform/computePeaks.ts`, `storage/db.ts` (via
`fake-indexeddb`), and the store (`usePlayerStore.ts`, with a fake
`AudioEngine` injected via `__setEngineFactory`).

The **imperative engine and canvas** (`SoundTouchEngine.ts`,
`WaveformCanvas.tsx`) have no unit tests — they're verified by `vite build`
succeeding and manual device checks (real `AudioContext`/`AudioWorkletNode`
and `<canvas>`/touch events aren't meaningfully testable in jsdom). This is
intentional, not a coverage gap to close casually.

## Engine rules (SoundTouchEngine)

These are load-bearing and easy to get wrong if re-implemented:

- **Tempo**: `setTempo(rate)` sets `playbackRate.value` on the
  `AudioBufferSourceNode` (`source.playbackRate`) **and** on the
  `SoundTouchNode` (`stNode.playbackRate`) — both, every time. Before
  switching, it captures the current position under the *old* tempo via
  `getCurrentTime()`, then re-anchors (`startOffset`, `startCtxTime`) before
  applying the new rate — order matters, see the comment in `setTempo`.
- **Pitch**: `setPitchSemitones(n)` sets `stNode.pitchSemitones.value` only
  (tempo/rate is unaffected — that's the point of SoundTouch pitch-shifting).
- **A-B loop**: implemented with the native
  `source.loop` / `source.loopStart` / `source.loopEnd`, not app-level
  seek-back logic.
- **Position is computed, never reported.** The worklet does not report
  playhead position. `getCurrentTime()` is pure: it derives the current
  source-time from `startOffset + elapsed*tempo` via
  `engine/position.ts`'s `currentSourceTime()`, wrapping into the loop region
  when one is active. It is polled every animation frame (from
  `WaveformCanvas`'s rAF loop calling `store.tick()`), not pushed by the
  audio graph.
- **Natural end** is detected via `source.onended`, not by polling
  `getCurrentTime()` against duration.

## Waveform viewport

The view is a **moving centered viewport**: the playhead is drawn fixed at
canvas center (`cssW / 2`); the waveform scrolls under it as `position`
changes (`timeToX`/`xToTime` in `waveform/viewport.ts`). Zoom
(`pxPerSec`) ranges 20–400 px/s (`PX_PER_SEC_MIN`/`MAX`), default 100.
Touch: 1-finger drag pans (seeks), pausing playback for the gesture and
resuming on release if it was playing; 2-finger pinch zooms `pxPerSec`.

The **minimap** scrubs *relatively*: touching it does nothing, and the playhead
then moves by the finger's delta (finger right = forward), with a `SLOP_PX`
dead-zone so a bare tap is a complete no-op (an absolute jump-to-tap was
unusable — on a 48px strip a 3mm miss is ~20s). Its gesture state machine is a
**pure reducer** (`waveform/minimapGesture.ts`) and is unit-tested; the canvas is
only a DOM adapter. It landed there because every version of that handler shipped
a HIGH bug (a dead-lock, then a stale-`playing` inversion) and all of them were
pure logic.

**Touch handlers on either canvas must use `e.targetTouches`** — fingers that
started on *this* element — and never `e.touches`, which counts every finger on
the screen. A finger resting on the minimap plus a finger on the waveform made
`e.touches.length === 2` and silently put the waveform into pinch-zoom. Both
canvases also register `touchcancel`, or a cancelled gesture strands playback
paused forever.

## Gotchas / non-obvious

1. **Zustand v5 object-selector infinite loop.** A store selector that
   returns a *new* object/array every call must be wrapped in `useShallow`
   from `zustand/react/shallow`, or React throws "getSnapshot should be
   cached" (infinite re-render). Single-field selectors
   (`usePlayerStore((s) => s.tempo)`) are fine as-is. See
   `src/ui/LoopControls.tsx` and `src/ui/TransportBar.tsx` for the pattern —
   both select multiple fields via `useShallow(() => ({...}))`.
2. **`source.onended` must be guarded by identity, not a boolean flag.**
   `SoundTouchEngine.startSource` closes over the specific `src` node and
   checks `if (this.source !== src) return` inside `onended`. A boolean
   "stopped" flag would race, because `source.stop()` fires the `ended`
   event asynchronously — by the time it fires, a new source may already be
   playing. This was a real bug found and fixed during implementation.
3. **jsdom has no Web Audio.** `SoundTouchNode` (`class SoundTouchNode
   extends AudioWorkletNode`) throws at *import* time under jsdom (no
   `AudioWorkletNode` global), so anything that transitively imports
   `SoundTouchEngine.ts` (including the store) would crash on test collection.
   `src/test-setup.ts` stubs a minimal `globalThis.AudioWorkletNode` class so
   the import succeeds; no test constructs a real engine (tests inject a
   fake `AudioEngine` via `__setEngineFactory`). This is also why
   `SoundTouchEngine`/`WaveformCanvas` have no unit tests (see above).
4. **CSS side-effect imports** (`import './ui/styles.css'` in `App.tsx`)
   need the `vite/client` ambient types, which live in
   `src/vite-env.d.ts` (`/// <reference types="vite/client" />`) — added
   separately from `tsconfig.json`'s `types` array because that array is
   restricted to `["vitest/globals", "@testing-library/jest-dom"]`.
5. **`vite.config.ts` is outside the tsc gate.** `tsconfig.json` has
   `"include": ["src"]`, so `vite.config.ts` at the repo root is not
   type-checked by `npx tsc --noEmit` or the `tsc -b` step of `npm run
   build`. Config errors (e.g. a bad `vite-plugin-pwa` option) only surface
   when `vite build` actually runs the config — always run a real build
   after touching it, `tsc --noEmit` passing is not sufficient.
6. **Toolchain majors are recent/unusual — don't assume older behavior:**
   TypeScript 7 (native "tsgo" compiler, not the classic tsc), Vite 8,
   Vitest 4, React 19, Zustand 5.
7. **`persist()` is debounced 400ms** (`src/store/usePlayerStore.ts`) —
   tempo/pitch/loop/pxPerSec/position changes coalesce into one
   `db.saveState` call per 400ms of inactivity, not one write per action.
   There is no test-flush hook to force a synchronous write; tests that care
   about persisted state currently don't cover the debounced path. Known
   minor gap, not a bug.

## Out of scope for MVP

Marker UI and the mini-map **are** implemented (`src/ui/MarkersControl.tsx`,
`src/waveform/MiniMap.tsx`); `persistNow` saves the real `markers` array, and
`openTrack` restores it. A Rubberband-based `AudioEngine` is a possible future
engine swap; only `SoundTouchEngine` exists today.
