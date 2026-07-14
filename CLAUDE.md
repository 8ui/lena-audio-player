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
npm run icons     # regenerate the PWA icons (scripts/gen-icons.mjs, zero deps)
```

Currently 18 test files / 122 tests, all passing. **Note:** Type-checking is not part of the build pipeline — run `npx tsc --noEmit` separately if you want to verify types before bundling (esbuild strips types, so `vite build` alone does not catch type errors).

## Architecture

Five layers, each one only talks to the layer directly below it:

1. **UI** (`src/screens/*`, `src/ui/*`, `src/App.tsx`) — React components.
   `App.tsx` switches between `Library` (import/pick a track) and `Player`
   based on `currentTrackId`, and renders the dismissible error banner.
   `Player` (`src/screens/Player.tsx`) composes `PlayerHeader`, a
   `.wave-wrap` holding `WaveformCanvas` plus `TimeBadge` (an overlay plaque;
   `pointer-events: none` so a pan gesture starting on it still reaches the
   canvas), `MiniMap`, and `PlayerDock` = `TempoStepper` + `TransportBar`
   (play-only now — the old ±5s buttons and the time readout are gone) +
   `ControlTabs`. `ControlTabs` renders three chips that act as tabs over an
   overlay popover holding `PitchPanel` / `LoopPanel` / `MarkersPanel`; which
   tab is open is local React state, never the store, and the popover
   overlays the waveform rather than resizing it (see Theming and Gotcha 9).
   Components read/act on the store only — never touch the engine or
   IndexedDB directly.
2. **Store** (`src/store/usePlayerStore.ts`) — a single Zustand store that is
   the sole owner of the `AudioEngine` instance and the sole writer to
   IndexedDB. All UI actions (`togglePlay`, `seek`, `setTempo`, `setPitch`,
   `setLoopA/B`, `clearLoop`, `setPxPerSec`, `addMarker`, `removeMarker`,
   `seekPrev/NextMarker`, `clearError`) go through it. `tick()` polls the
   engine's clock into `position`/`playing` state (driven from
   `WaveformCanvas`'s rAF loop, not a separate timer). Decode failures
   (unsupported/corrupt file) are caught here and surfaced as `error`.
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
   cheap. `markers.ts` holds the pure marker math (sort/relabel/nearest), and
   `minimapGesture.ts` is the minimap's gesture state machine as a **pure
   reducer** — unit-tested, with `MiniMap.tsx` reduced to a DOM adapter.
   Both canvases take every colour from `activePalette()` (`src/ui/theme.ts`,
   see Theming) once per drawn frame — neither has a hardcoded hex left in it.
5. **Storage** (`src/storage/db.ts`) — thin `idb` wrapper, two object stores:
   `tracks` (blob + peaks + duration, keyed by id) and `trackState` (tempo,
   pitch, loop, pxPerSec, markers, lastPosition, keyed by trackId).

Plus a thin **PWA shell**: `src/pwa/wakeLock.ts` (screen wake lock while
playing) and `vite-plugin-pwa` (manifest + service worker, configured in
`vite.config.ts`) for offline/installable behavior.

### What's tested vs. what's manually verified

The **pure modules** are the TDD surface and have real unit tests:
`engine/params.ts` (clamps, `stepTempo`'s rounding), `engine/position.ts`
(`currentSourceTime`), `waveform/viewport.ts`, `waveform/computePeaks.ts`,
`waveform/markers.ts`, `waveform/minimapGesture.ts`, `uuid.ts`,
`ui/time.ts` (`fmtTime`/`fmtTimeTenths`), `storage/db.ts` (via
`fake-indexeddb`), and the store (`usePlayerStore.ts`,
with a fake `AudioEngine` injected via `__setEngineFactory`). `theme.test.ts`
similarly pins `theme.ts` against `styles.css` (see Theming). Components with
real logic (`ControlTabs`, `TempoStepper`, the panels, the dock, `App`'s
error banner) have RTL tests: `ControlTabs.test.tsx`, `TempoStepper.test.tsx`,
`panels.test.tsx`, `dock.test.tsx`, `App.test.tsx`.

The **imperative engine and canvases** (`SoundTouchEngine.ts`,
`WaveformCanvas.tsx`, `MiniMap.tsx`) have no unit tests — they're verified by
`vite build` succeeding and manual device checks (real
`AudioContext`/`AudioWorkletNode` and `<canvas>`/touch events aren't
meaningfully testable in jsdom). This is intentional, not a coverage gap to
close casually.

**Push logic OUT of the canvases.** The minimap's gesture handler shipped a HIGH
bug in every version it had while the logic lived inside the component (a
dead-lock, then a stale-`playing` inversion) — and every one of those bugs was
pure logic: identifier matching, ordering, a threshold, a state race. It is now
a pure reducer (`minimapGesture.ts`) with the component as a thin DOM adapter,
and those bugs are pinned by tests. Do the same for the next gesture.

**What tests structurally cannot cover here** (so don't trust green CI alone):
audio actually being audible, `WORKLET_URL`/`base` correctness (vitest forces
`base: '/'` — see gotcha 8), stretch quality and latency, real touch gestures,
PWA install/offline, wake lock. All device-only.

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

## Theming

`src/ui/theme.ts` is the **single source of colour**: two flat `Palette`
objects, `warm` (the default) and `studio`. `src/main.tsx` calls
`applyTheme()` *before* `createRoot(...).render(...)`; it reads the choice
from `localStorage` (key `razbor.theme`) and stamps it as `<html
data-theme="warm"|"studio">`. There is deliberately no UI switcher yet — the
only way to reach `studio` today is
`localStorage.setItem('razbor.theme', 'studio')` + reload. `src/ui/styles.css`
mirrors every `Palette` key as a CSS variable under `:root[data-theme=…]`,
and the canvases read colour via `activePalette()` (a single
`dataset.theme` read, called once per drawn frame) instead of hardcoding hex.

**Nothing but `theme.test.ts` stops `theme.ts` and `styles.css` from drifting
apart.** It imports the stylesheet via a Vite `?raw` import (`import css from
'./styles.css?raw'` — which is why `vite.config.ts`'s `test` block now sets
`css: true`; without it a `?raw` import resolves to `''` under vitest) and
asserts every palette key matches its CSS variable, for both themes. Add or
change a colour in one file without the other and this is the only thing
that catches it.

`index.html`'s `<html>` tag also carries a **static** `data-theme="warm"` —
not a leftover, a deliberate default. Every colour variable lives under
`:root[data-theme=…]`, and the stylesheet is render-blocking while
`applyTheme()` only runs once `main.tsx`'s deferred module script executes.
Without the static attribute, first paint has every `--var` unresolved
(transparent, not the dark background) and the page flashes white before
repainting dark. `applyTheme()` still overwrites the attribute from
`localStorage` right after, e.g. to `'studio'` — the static value only needs
to match `DEFAULT_THEME`.

## Gotchas / non-obvious

1. **Zustand v5 object-selector infinite loop.** A store selector that
   returns a *new* object/array every call must be wrapped in `useShallow`
   from `zustand/react/shallow`, or React throws "getSnapshot should be
   cached" (infinite re-render). Single-field selectors
   (`usePlayerStore((s) => s.tempo)`) are fine as-is. See
   `src/ui/LoopPanel.tsx` and `src/ui/TransportBar.tsx` for the pattern —
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
8. **The app is served from a subpath** (`base: '/lena-audio-player/'` in
   `vite.config.ts` — GitHub Pages). Any URL to a `public/` asset must be
   derived from `import.meta.env.BASE_URL` (in TS), or start with a **leading
   slash** (in `index.html`) so Vite rebases it — a *relative* href is silently
   NOT rebased, and a missing public file is not even a build error. `BASE_URL`
   is guaranteed a *leading* slash only, **never a trailing one**, so normalise
   it (`.replace(/\/?$/, '/')`).

   The one that matters is `WORKLET_URL` in `SoundTouchEngine.ts`: if it 404s,
   `SoundTouchNode.register` rejects, `load()` throws, and **no audio plays at
   all** while the entire UI still renders perfectly.

   **The test suite structurally cannot catch a base regression** — vitest forces
   `base: '/'`, so `BASE_URL` is always `'/'` under tests. A green `npm test`
   proves nothing here. Only a real `vite build` plus loading a track on the
   deployed site does. Useful build assertions:
   ```bash
   grep -o '"scope":"[^"]*"' dist/manifest.webmanifest  # -> /lena-audio-player/
   grep -c soundtouch-processor dist/sw.js              # >=1 == precached == offline works
   grep -o 'apple-touch-icon[^>]*' dist/index.html      # href must be rebased
   ```
9. **`ControlTabs`' popover must stay an overlay, and every row of `.dock`
   (`.tempo`, `.transport`, `.chips`) must stay positioned above
   `.backdrop`.** The tab panel (`.popover`, `position: absolute`, floated
   over the dock) must never become a row in the flex column — putting it
   back inline would resize/jump the waveform every time a tab opens.
   Relatedly, `.tempo`, `.transport` and `.chips` all carry
   `position: relative; z-index: 30;` — load-bearing, not decorative:
   `.backdrop` (`position: fixed; z-index: 10`, covering the full viewport
   so a tap outside the popover closes it) paints above any non-positioned
   in-flow sibling regardless of source order — so without that z-index on
   a row, the backdrop silently sits on top of it and swallows the first tap
   meant for it while a panel is open (the tap just closes the panel; the
   user has to tap again). This bit `.chips` first (tab-switching itself was
   dead) and then `.tempo`/`.transport` (▶ and the tempo −/+ needed a double
   tap) — the rule is *every* dock row, not just the tab chips; a new row
   added to `.dock` needs the same opt-out. jsdom cannot hit-test stacking
   contexts, so `ControlTabs.test.tsx` asserts the CSS z-order for all three
   rows by reading `styles.css` directly instead of simulating the
   click-through.

## Deploy

GitHub Pages via `.github/workflows/deploy.yml` on push to `main`
(`tsc --noEmit` + `npm test` + `vite build` → `actions/deploy-pages`).
Live at <https://8ui.github.io/lena-audio-player/>. Icons are generated, not
hand-drawn: `node scripts/gen-icons.mjs` (zero-dep PNG writer; the artwork is the
app's own waveform + playhead). iOS note: an installed PWA has its **own
IndexedDB**, separate from the Safari tab — tracks imported in Safari do not
appear in the installed app. Platform rule, not a bug.

## Out of scope for MVP

Marker UI and the mini-map **are** implemented (`src/ui/MarkersPanel.tsx`,
`src/waveform/MiniMap.tsx`); `persistNow` saves the real `markers` array, and
`openTrack` restores it. A Rubberband-based `AudioEngine` is a possible future
engine swap; only `SoundTouchEngine` exists today.
