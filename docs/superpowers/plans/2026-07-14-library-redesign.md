# Library Screen Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the library screen (`src/screens/Library.tsx`) on the existing design system: track cards with an SVG waveform preview and resume progress, an action sheet in place of `confirm()`, an import FAB, a theme toggle, and a defined sort order.

**Architecture:** Every per-item computation (sort order, progress ratio, badge text, bar heights) lands in a **pure module with unit tests**; the components only render what they are handed. The card's waveform is **SVG driven by CSS variables**, not a canvas — so switching the theme repaints every card with zero imperative code. The store gains one field, `trackStates`, so the list can answer "where did I stop".

**Tech Stack:** React 19 + TypeScript (tsgo / TS 7) + Vite 8 + Zustand 5 + `idb` + Vitest 4 + RTL. No new dependencies.

## Global Constraints

Every task's requirements implicitly include these. Each one already cost this project a bug.

- **`AUDIO_ACCEPT` must keep its explicit file extensions.** Never simplify to `audio/*`: iOS maps `accept` onto UTIs, greys out real `.mp3` files in the picker, and import becomes physically impossible.
- **Touch targets ≥ `var(--touch)` (48px):** the `⋯` button, the FAB, sheet buttons, the theme swatch.
- **safe-area:** header uses `env(safe-area-inset-top)`; FAB and sheet use `env(safe-area-inset-bottom)`. iOS standalone runs full-bleed.
- **Zustand v5:** a selector returning a fresh object/array every call needs `useShallow`, or React throws "getSnapshot should be cached". Prefer single-field selectors.
- **A colour token added to `src/ui/theme.ts` must be added to `src/ui/styles.css` too, for BOTH palettes** (`warm` and `studio`), or `theme.test.ts` fails. That is exactly what it is for.
- **Logic lives in pure modules, not components.** Sorting, progress, badges, bar heights — all unit-tested functions.
- **The player is not touched.** Shared tokens may be extended, but nothing under `Player`/`WaveformCanvas`/`MiniMap` changes.
- **Gates:** `npm test` (123 tests / 18 files today), `npx tsc --noEmit`, `npm run build`. Type-checking is NOT part of the build — run it separately.

## File Structure

| File | Responsibility |
|---|---|
| `src/waveform/computePeaks.ts` | `+ barHeights(peaks, bars)` — peaks → 0..1 amplitude per bar |
| `src/ui/libraryModel.ts` | **new** — `sortTracks`, `progressRatio`, `tempoBadge`, `pitchBadge`, `loopBadge` |
| `src/ui/theme.ts` | `+ danger` token, `+ setThemeName(name)` (it can read and apply, but not write) |
| `src/storage/db.ts` | `+ listStates()` |
| `src/store/usePlayerStore.ts` | `+ trackStates` field; import failure surfaces as an error |
| `src/ui/TrackWave.tsx` | **new** — stateless SVG waveform preview |
| `src/ui/TrackCard.tsx` | **new** — one card: name, duration, wave, resume time, badges, `⋯` |
| `src/ui/TrackSheet.tsx` | **new** — backdrop + bottom sheet: Удалить / Отмена |
| `src/ui/importAccept.ts` | **new** — the `AUDIO_ACCEPT` constant (moves out of `Library.tsx`) |
| `src/ui/ImportButton.tsx` | **new** — hidden `<input type=file>` + a button; used as both FAB and empty-state CTA |
| `src/ui/ThemeToggle.tsx` | **new** — accent-coloured swatch, tap toggles the palette |
| `src/ui/LibraryHeader.tsx` | **new** — "Разбор" + `ThemeToggle` |
| `src/ui/EmptyLibrary.tsx` | **new** — centred empty state with a CTA |
| `src/screens/Library.tsx` | **rewritten** — header + list + FAB + sheet |
| `src/ui/styles.css` | `.screen-header` / `.control-row` / `.library-item` deleted; library classes added |
| `src/ui/libraryLayers.test.ts` | **new** — pins the sheet's z-order against the header and the FAB |

---

### Task 1: `barHeights` — peaks to bar amplitudes

**Files:**
- Modify: `src/waveform/computePeaks.ts`
- Test: `src/waveform/computePeaks.test.ts`

**Interfaces:**
- Consumes: the existing `downsamplePeaks(peaks: Float32Array, columns: number): Float32Array` in the same file — it reduces the interleaved `[min, max]` peaks to `columns` `[min, max]` pairs and already guarantees at least one bucket per column.
- Produces: `barHeights(peaks: Float32Array, bars: number): number[]` — exactly `bars` entries, each in `0..1`. Used by `TrackWave` (Task 6).

- [ ] **Step 1: Write the failing tests**

Append to `src/waveform/computePeaks.test.ts`:

```ts
describe('barHeights', () => {
  it('returns exactly `bars` entries', () => {
    const peaks = computePeaks(new Float32Array(4410).fill(0.5), 44100);
    expect(barHeights(peaks, 48)).toHaveLength(48);
  });

  it('collapses each [min,max] pair to its largest absolute amplitude', () => {
    // Two buckets: [-0.25, 0.25] and [-0.8, 0.1]. The second is louder on the
    // negative side, so the bar must follow |min|, not max.
    const peaks = new Float32Array([-0.25, 0.25, -0.8, 0.1]);
    expect(barHeights(peaks, 2)).toEqual([0.25, 0.8]);
  });

  it('clamps to 1 — a bar can never overflow the card', () => {
    const peaks = new Float32Array([-1.5, 1.2]);
    expect(barHeights(peaks, 1)).toEqual([1]);
  });

  // A track whose peaks failed to compute must still render a (flat) card
  // rather than crash the whole list.
  it('returns a full row of zeroes for empty peaks', () => {
    expect(barHeights(new Float32Array(0), 4)).toEqual([0, 0, 0, 0]);
  });

  it('returns nothing for a non-positive bar count', () => {
    expect(barHeights(new Float32Array([0, 1]), 0)).toEqual([]);
  });
});
```

Add `barHeights` to the existing import at the top of the file (it currently imports `computePeaks` and `downsamplePeaks` from `./computePeaks`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/waveform/computePeaks.test.ts`
Expected: FAIL — `barHeights is not a function` / no exported member `barHeights`.

- [ ] **Step 3: Write the implementation**

Append to `src/waveform/computePeaks.ts`:

```ts
// A card's waveform preview is ~48 bars, not a per-pixel trace: reuse the
// minimap's column reduction and collapse each [min,max] pair into a single
// 0..1 amplitude. Pure on purpose — the card renders SVG from this and owns no
// drawing logic of its own.
export function barHeights(peaks: Float32Array, bars: number): number[] {
  if (bars <= 0) return [];
  const cols = downsamplePeaks(peaks, bars);
  // downsamplePeaks returns an empty array when there are no buckets at all;
  // a flat row still has to render, so fall back to zeroes rather than [].
  if (cols.length === 0) return new Array(bars).fill(0);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const amp = Math.max(Math.abs(cols[i * 2]), Math.abs(cols[i * 2 + 1]));
    out.push(Math.min(1, amp));
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/waveform/computePeaks.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/waveform/computePeaks.ts src/waveform/computePeaks.test.ts
git commit -m "feat(waveform): barHeights — peaks to per-bar amplitudes for the card preview"
```

---

### Task 2: `libraryModel` — sort, progress, badges

**Files:**
- Create: `src/ui/libraryModel.ts`
- Test: `src/ui/libraryModel.test.ts`

**Interfaces:**
- Consumes: `TrackRecord` from `src/types.ts` (`{ id, name, blob, peaks, duration, createdAt }`).
- Produces:
  - `sortTracks(tracks: TrackRecord[]): TrackRecord[]` — a **copy**, newest `createdAt` first.
  - `progressRatio(lastPosition: number, duration: number): number` — clamped `0..1`.
  - `tempoBadge(tempo: number): string | null`
  - `pitchBadge(pitch: number): string | null`
  - `loopBadge(loopStart: number | null, loopEnd: number | null): string | null`

  All five are used by `TrackCard` (Task 7) and `Library` (Task 12).

- [ ] **Step 1: Write the failing tests**

Create `src/ui/libraryModel.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/libraryModel.test.ts`
Expected: FAIL — cannot resolve `./libraryModel`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/libraryModel.ts`:

```ts
import type { TrackRecord } from '../types';

// Everything the library screen computes per track lives here, so the card can
// stay a pure render of values it was handed. Same rule as waveform/markers.ts:
// logic that lives inside a component is logic that ships bugs no test sees.

// db.listTracks() is a bare getAll('tracks') — object-store key order, i.e. no
// order at all. Newest first is what the screen promises.
export function sortTracks(tracks: TrackRecord[]): TrackRecord[] {
  return [...tracks].sort((a, b) => b.createdAt - a.createdAt);
}

// Guarded against duration <= 0: a NaN or Infinity here would propagate into
// every bar's SVG geometry and blank the card.
export function progressRatio(lastPosition: number, duration: number): number {
  if (!(duration > 0)) return 0;
  return Math.min(1, Math.max(0, lastPosition / duration));
}

// The badges answer "what was I doing with this track" without opening it, so
// they only appear when the value is NOT the default.
export function tempoBadge(tempo: number): string | null {
  const pct = Math.round(tempo * 100);
  return pct === 100 ? null : `${pct}%`;
}

export function pitchBadge(pitch: number): string | null {
  if (pitch === 0) return null;
  // U+2212 MINUS SIGN, not a hyphen: at arm's length a hyphen next to a digit
  // reads as dirt on the screen.
  return pitch > 0 ? `+${pitch}` : `−${Math.abs(pitch)}`;
}

// Same condition the engine and the minimap use — a loop only exists when B is
// past A.
export function loopBadge(loopStart: number | null, loopEnd: number | null): string | null {
  if (loopStart === null || loopEnd === null || loopEnd <= loopStart) return null;
  return 'A–B';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/libraryModel.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/libraryModel.ts src/ui/libraryModel.test.ts
git commit -m "feat(ui): libraryModel — sort order, resume progress and setting badges"
```

---

### Task 3: theme — the `danger` token and `setThemeName`

**Files:**
- Modify: `src/ui/theme.ts`
- Modify: `src/ui/styles.css:10-40` (the two `:root[data-theme=…]` blocks)
- Modify: `src/App.tsx:34` (the hardcoded banner colour)
- Test: `src/ui/theme.test.ts`

**Interfaces:**
- Produces:
  - `setThemeName(name: ThemeName): void` — writes `localStorage['razbor.theme']` and calls `applyTheme`. Used by `ThemeToggle` (Task 10).
  - `Palette.danger: string` — a new key, mirrored as `--danger` in CSS. Used by `TrackSheet` (Task 8).

**Why:** `theme.ts` today can *read* the stored theme (`loadThemeName`) and *apply* it (`applyTheme`), but nothing can **write** it — the only way to reach `studio` is typing into the console. The toggle needs a writer.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('theme', …)` block in `src/ui/theme.test.ts`:

```ts
  it('setThemeName persists the choice and applies it', () => {
    setThemeName('studio');
    expect(localStorage.getItem('razbor.theme')).toBe('studio');
    expect(document.documentElement.dataset.theme).toBe('studio');
    expect(loadThemeName()).toBe('studio');

    setThemeName('warm');
    expect(localStorage.getItem('razbor.theme')).toBe('warm');
    expect(document.documentElement.dataset.theme).toBe('warm');

    localStorage.removeItem('razbor.theme');
  });
```

Add `setThemeName` to the import at the top of the file.

The existing "every palette key matches its CSS variable" test already iterates over every key of `Palette` for both themes — adding `danger` to `theme.ts` without adding `--danger` to **both** blocks of `styles.css` makes it fail. That is the coverage for the new token; no extra test needed.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/theme.test.ts`
Expected: FAIL — no exported member `setThemeName`.

- [ ] **Step 3: Write the implementation**

In `src/ui/theme.ts`, add `danger` to the `Palette` interface (after `onAccent`):

```ts
  onAccent: string;
  danger: string;
```

Add the value to **both** palettes in `THEMES` (same red in both — it is the "destructive" colour, not a brand colour, and it already exists in the codebase as the error banner's `#c0392b`):

```ts
  warm: {
    // …
    onAccent: '#231a08',
    danger: '#c0392b',
    // …
  },
  studio: {
    // …
    onAccent: '#08111f',
    danger: '#c0392b',
    // …
  },
```

Add the writer below `loadThemeName`:

```ts
// loadThemeName reads and applyTheme applies — nothing could WRITE the choice
// until now, which is why `studio` was reachable only from the console.
export function setThemeName(name: ThemeName): void {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Safari private mode throws on write. The theme still applies for this
    // session; it just won't survive a reload.
  }
  applyTheme(name);
}
```

In `src/ui/styles.css`, add `--danger: #c0392b;` to **both** `:root[data-theme='warm']` and `:root[data-theme='studio']` blocks (after `--on-accent`).

In `src/App.tsx`, replace the hardcoded banner colour:

```tsx
            background: 'var(--danger)',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/theme.test.ts src/App.test.tsx`
Expected: PASS. If the palette-parity test fails, `--danger` is missing from one of the two CSS blocks — that is the test doing its job.

- [ ] **Step 5: Commit**

```bash
git add src/ui/theme.ts src/ui/theme.test.ts src/ui/styles.css src/App.tsx
git commit -m "feat(ui): add the danger token and setThemeName, the theme writer"
```

---

### Task 4: `db.listStates()`

**Files:**
- Modify: `src/storage/db.ts`
- Test: `src/storage/db.test.ts`

**Interfaces:**
- Produces: `listStates(): Promise<TrackStateRecord[]>` — every persisted per-track state. Used by the store's `init()` (Task 5).

**Why:** the list has to answer "where did I stop", and `lastPosition` lives in the `trackState` store, which nothing but `getState(trackId)` ever reads — one id at a time.

- [ ] **Step 1: Write the failing test**

Append to `src/storage/db.test.ts`, inside the existing `describe('storage', …)`. That file imports its functions **by name** (`import { addTrack, listTracks, … } from './db'`) — add `listStates` to that import list, do not switch the file to a namespace import.

```ts
  it('listStates returns every persisted track state at once', async () => {
    await saveState({ ...defaultState('s1'), lastPosition: 12 });
    await saveState({ ...defaultState('s2'), lastPosition: 34 });

    const byId = Object.fromEntries(
      (await listStates()).map((s) => [s.trackId, s.lastPosition]),
    );

    expect(byId['s1']).toBe(12);
    expect(byId['s2']).toBe(34);
  });
```

**Do not add an "it returns an empty array" case.** The file's `beforeEach` only deletes *tracks* (`for (const t of await listTracks()) await deleteTrack(t.id)`), and the existing "saves and restores state" test writes a state for id `'c'` with no matching track — so that row survives every cleanup and the `trackState` store is never empty. Assert on the ids you wrote, as above, not on the total.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/storage/db.test.ts`
Expected: FAIL — `db.listStates is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/storage/db.ts`, next to `getState`:

```ts
// The library screen needs every track's state at once (to show where the user
// stopped) — getState(trackId) is one id at a time.
export async function listStates(): Promise<TrackStateRecord[]> {
  return (await db()).getAll('trackState');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/storage/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/db.ts src/storage/db.test.ts
git commit -m "feat(storage): listStates — read every track's saved state at once"
```

---

### Task 5: store — the `trackStates` field

**Files:**
- Modify: `src/store/usePlayerStore.ts`
- Test: `src/store/usePlayerStore.test.ts`

**Interfaces:**
- Consumes: `db.listStates()` (Task 4).
- Produces: `PlayerState.trackStates: Record<string, TrackStateRecord>` — keyed by track id, read by `Library` (Task 12) and `TrackCard` (Task 7).

**Behaviour:**
- `init()` loads tracks **and** states.
- `importFile()` catches a storage failure and surfaces it in the existing `error` banner — an import that silently does not save is the worst failure this app has.
- `removeTrack()` drops the id from the map.
- `closeTrack()` writes the outgoing track's live state into the map **locally**, right after the flush — that is what makes the freshly-updated resume position visible the instant you come back from the player, without re-reading IndexedDB.

- [ ] **Step 1: Write the failing tests**

Append to `src/store/usePlayerStore.test.ts`. Note the `beforeEach` in that file resets the store with an explicit object — **add `trackStates: {}` to it** so no state leaks between tests.

```ts
  it('init loads the saved state of every track, keyed by id', async () => {
    const rec: TrackRecord = {
      id: 'x', name: 'X', blob: new Blob(), peaks: new Float32Array(),
      duration: 100, createdAt: 1,
    };
    await db.addTrack(rec);
    await db.saveState({ ...db.defaultState('x'), lastPosition: 42, tempo: 0.8 });

    await usePlayerStore.getState().init();

    const { trackStates } = usePlayerStore.getState();
    expect(trackStates['x'].lastPosition).toBe(42);
    expect(trackStates['x'].tempo).toBe(0.8);
  });

  // The list shows "where did I stop". If closeTrack only flushed to IndexedDB,
  // the card would still show the position from when the track was OPENED until
  // the next full init() — i.e. until the app restarts.
  it('closeTrack publishes the outgoing position into trackStates', () => {
    usePlayerStore.setState({ currentTrackId: 'x', position: 55, tempo: 0.9, pitch: -2 });

    usePlayerStore.getState().closeTrack();

    const { trackStates, currentTrackId } = usePlayerStore.getState();
    expect(currentTrackId).toBeNull();
    expect(trackStates['x'].lastPosition).toBe(55);
    expect(trackStates['x'].tempo).toBe(0.9);
    expect(trackStates['x'].pitch).toBe(-2);
  });

  it('removeTrack drops the track state from the map', async () => {
    const rec: TrackRecord = {
      id: 'x', name: 'X', blob: new Blob(), peaks: new Float32Array(),
      duration: 100, createdAt: 1,
    };
    await db.addTrack(rec);
    usePlayerStore.setState({ trackStates: { x: db.defaultState('x') } });

    await usePlayerStore.getState().removeTrack('x');

    expect(usePlayerStore.getState().trackStates['x']).toBeUndefined();
  });

  // A quota overflow (a big file on a full phone) rejects inside db.addTrack
  // with nobody catching it: the import silently does nothing and the user is
  // told nothing.
  it('importFile surfaces a storage failure in the error banner', async () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = class {
      decodeAudioData = vi.fn().mockResolvedValue({
        duration: 1,
        sampleRate: 44100,
        getChannelData: () => new Float32Array(44100),
      });
    };
    // The store caches its AudioContext in a module-level `sharedCtx`, and the
    // decode-failure test above populates it with a REJECTING stub. Without this
    // reset, whether this test sees a working decode depends on test order.
    __resetAudioContext();

    const addTrack = vi.spyOn(db, 'addTrack').mockRejectedValue(new Error('quota'));

    await usePlayerStore.getState().importFile(new File([new ArrayBuffer(8)], 'a.mp3'));

    expect(usePlayerStore.getState().error).toMatch(/место/i);
    expect(usePlayerStore.getState().library).toEqual([]);

    addTrack.mockRestore();
    __resetAudioContext(); // don't leave the working stub cached for the next test
  });
```

Add `__resetAudioContext` to the existing `import { usePlayerStore, __setEngineFactory } from './usePlayerStore'` line.

**Two things the implementer must not skip:**

1. **The `sharedCtx` reset is not optional.** `usePlayerStore.ts` caches its `AudioContext` in a module-level `sharedCtx` that is created once and never cleared. The existing decode-failure test stubs `globalThis.AudioContext` with a context whose `decodeAudioData` **rejects**; whichever test calls `ctx()` first wins the cache for the whole file. Task 5's implementation adds the `__resetAudioContext()` seam for exactly this — it follows the `__setEngineFactory` precedent already in the file.
2. **`vi.spyOn(db, 'addTrack')` relies on the store importing the module as a namespace** (`import * as db from '../storage/db'`), which it does. If Vitest reports the namespace as non-configurable, replace the spy with `vi.mock('../storage/db', { spy: true })` and stub `addTrack` through the mocked module — do **not** work around it by weakening the assertion.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/store/usePlayerStore.test.ts`
Expected: FAIL — `trackStates` is undefined; `closeTrack` does not populate it.

- [ ] **Step 3: Write the implementation**

In `src/store/usePlayerStore.ts`:

Add the test seam next to the existing `__setEngineFactory`, just below the `ctx()` helper:

```ts
// Test seam, like __setEngineFactory above. `sharedCtx` is created once and
// cached forever; tests stub globalThis.AudioContext with contexts that behave
// differently (one rejects the decode, one resolves it), so whichever test runs
// first would otherwise own the cache for the whole file.
export function __resetAudioContext(): void {
  sharedCtx = null;
}
```

Add to the `PlayerState` interface, next to `library`:

```ts
  library: TrackRecord[];
  // Every track's persisted state, keyed by track id — this is what lets the
  // library show where the user stopped. Loaded once in init(), then kept in
  // step by importFile/removeTrack/closeTrack.
  trackStates: Record<string, TrackStateRecord>;
```

Import the type:

```ts
import type { TrackRecord, TrackStateRecord, Marker } from '../types';
```

Add the initial value next to `library: []`:

```ts
  library: [],
  trackStates: {},
```

Replace `init`:

```ts
  async init() {
    const [library, states] = await Promise.all([db.listTracks(), db.listStates()]);
    const trackStates: Record<string, TrackStateRecord> = {};
    for (const s of states) trackStates[s.trackId] = s;
    set({ library, trackStates });
  },
```

In `importFile`, wrap the write (replacing the bare `await db.addTrack(rec);`):

```ts
    try {
      await db.addTrack(rec);
    } catch {
      // Quota overflow on a full phone rejects here. Silence would mean the
      // track just never appears in the list, with no explanation.
      set({ error: 'Не удалось сохранить трек — возможно, на устройстве кончилось место.' });
      return;
    }
    set({ library: await db.listTracks() });
```

In `removeTrack`, drop the id from the map — replace the final `set({ library: await db.listTracks() });` with:

```ts
    const { [id]: _removed, ...trackStates } = get().trackStates;
    set({ library: await db.listTracks(), trackStates });
```

Replace `closeTrack` entirely:

```ts
  closeTrack() {
    // Capture the id BEFORE anything clears it.
    const id = get().currentTrackId;
    // Flush FIRST, while currentTrackId/position still hold the outgoing
    // track's values — this is what saves the leave-position.
    flushPersist();
    engine?.pause();
    const s = get();
    // Publish the same values into trackStates locally. flushPersist() only
    // writes to IndexedDB; without this the card would keep showing the
    // position the track had when it was OPENED, until the next init().
    const trackStates = id
      ? {
          ...s.trackStates,
          [id]: {
            trackId: id,
            tempo: s.tempo,
            pitch: s.pitch,
            loopStart: s.loopStart,
            loopEnd: s.loopEnd,
            pxPerSec: s.pxPerSec,
            markers: s.markers,
            lastPosition: s.position,
          },
        }
      : s.trackStates;
    set({
      currentTrackId: null,
      playing: false,
      peaks: null,
      position: 0,
      markers: [],
      trackStates,
    });
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/store/usePlayerStore.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/store/usePlayerStore.ts src/store/usePlayerStore.test.ts
git commit -m "feat(store): trackStates — the library can finally show where you stopped"
```

---

### Task 6: `TrackWave` — the SVG waveform preview

**Files:**
- Create: `src/ui/TrackWave.tsx`
- Modify: `src/ui/styles.css` (append a `/* ── Library ── */` section at the end, replacing the `/* ── Library (out of scope…) ── */` heading; the three MVP rules below it stay for now and are deleted in Task 12)
- Test: `src/ui/TrackWave.test.tsx`

**Interfaces:**
- Consumes: `barHeights(peaks, bars)` (Task 1).
- Produces: `<TrackWave peaks={Float32Array} progress={number} />` and the exported constant `BARS = 48`. Used by `TrackCard` (Task 7).

**Why SVG and not a canvas:** a canvas per card would be N more imperative renderers, each with its own DPR handling and `activePalette()` read — by CLAUDE.md exactly the code class that unit tests cannot cover. SVG rects take their colour from **CSS variables**, so switching the theme repaints every card with no code at all.

- [ ] **Step 1: Write the failing test**

Create `src/ui/TrackWave.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TrackWave, BARS } from './TrackWave';

// A 1-second 44.1kHz buffer -> 200 buckets, plenty to downsample to BARS.
const peaks = new Float32Array(400).fill(0.5);

describe('TrackWave', () => {
  afterEach(cleanup);

  it('draws one bar per column', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0} />);
    expect(container.querySelectorAll('rect')).toHaveLength(BARS);
  });

  it('marks no bar as played for a track that was never opened', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0} />);
    expect(container.querySelectorAll('rect.played')).toHaveLength(0);
  });

  // This is the whole point of the preview: the amber part is how far you got.
  it('marks the played fraction of the bars', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0.5} />);
    expect(container.querySelectorAll('rect.played')).toHaveLength(BARS / 2);
  });

  it('marks every bar as played at the end of the track', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={1} />);
    expect(container.querySelectorAll('rect.played')).toHaveLength(BARS);
  });

  // The wave is decoration next to the track's name — a screen reader must not
  // read out 48 rectangles.
  it('is hidden from assistive tech', () => {
    const { container } = render(<TrackWave peaks={peaks} progress={0} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/TrackWave.test.tsx`
Expected: FAIL — cannot resolve `./TrackWave`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/TrackWave.tsx`:

```tsx
import { useMemo } from 'react';
import { barHeights } from '../waveform/computePeaks';

export const BARS = 48;

// Half the viewBox height. Bars are drawn symmetrically around the centre line.
const MID = 10;
// A silent passage must still leave a visible hairline, or the card looks broken.
const MIN_HALF = 0.5;

interface Props {
  peaks: Float32Array;
  /** 0..1 — see progressRatio in libraryModel. */
  progress: number;
}

// Deliberately NOT a canvas (see the plan/CLAUDE.md): every colour here comes
// from a CSS variable, so switching the theme recolours every card for free —
// no palette read, no redraw, no imperative code to get wrong.
export function TrackWave({ peaks, progress }: Props) {
  const bars = useMemo(() => barHeights(peaks, BARS), [peaks]);
  const played = Math.round(progress * BARS);

  return (
    <svg
      className="track-wave"
      viewBox={`0 0 ${BARS * 2} ${MID * 2}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bars.map((h, i) => {
        const half = Math.max(MIN_HALF, h * MID);
        return (
          <rect
            key={i}
            className={i < played ? 'played' : undefined}
            x={i * 2}
            y={MID - half}
            width={1}
            height={half * 2}
          />
        );
      })}
    </svg>
  );
}
```

Append to `src/ui/styles.css` (leave the existing `.screen-header` / `.control-row` / `.library-item` rules alone — Task 12 deletes them):

```css
/* ── Library ─────────────────────────────────────────────────────────────
   The card's waveform is SVG, not a canvas: these two rules are the entire
   theme story for it. Switching the palette re-resolves the variables and
   every card recolours without a line of JS. */
.track-wave {
  display: block;
  width: 100%;
  height: 28px;
}
.track-wave rect { fill: var(--muted); opacity: 0.45; }
.track-wave rect.played { fill: var(--accent); opacity: 1; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/TrackWave.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/TrackWave.tsx src/ui/TrackWave.test.tsx src/ui/styles.css
git commit -m "feat(ui): TrackWave — SVG waveform preview with a played-so-far fill"
```

---

### Task 7: `TrackCard`

**Files:**
- Create: `src/ui/TrackCard.tsx`
- Modify: `src/ui/styles.css` (append to the `/* ── Library ── */` section)
- Test: `src/ui/TrackCard.test.tsx`

**Interfaces:**
- Consumes: `TrackWave` + `BARS` (Task 6); `progressRatio`, `tempoBadge`, `pitchBadge`, `loopBadge` (Task 2); `fmtTime` from `./time`; `TrackRecord`, `TrackStateRecord` from `../types`.
- Produces:

```ts
interface TrackCardProps {
  track: TrackRecord;
  state?: TrackStateRecord;      // undefined = never opened
  onOpen(id: string): void;
  onMenu(id: string): void;
}
```

Used by `Library` (Task 12).

**The bug this fixes:** today the open handler sits on the `<span>` holding the name, so a tap on the duration or on the row's padding does **nothing at all**. The card gets a **stretched button** (`position: absolute; inset: 0`) so the whole card is the target.

- [ ] **Step 1: Write the failing test**

Create `src/ui/TrackCard.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TrackCard } from './TrackCard';
import type { TrackRecord, TrackStateRecord } from '../types';

const track: TrackRecord = {
  id: 'a',
  name: 'Соната',
  blob: new Blob(),
  peaks: new Float32Array(400).fill(0.5),
  duration: 125,
  createdAt: 1,
};

const state: TrackStateRecord = {
  trackId: 'a',
  tempo: 0.9,
  pitch: -2,
  loopStart: 10,
  loopEnd: 20,
  pxPerSec: 100,
  markers: [],
  lastPosition: 62.5,
};

describe('TrackCard', () => {
  afterEach(cleanup);

  it('shows the name and the duration', () => {
    render(<TrackCard track={track} onOpen={vi.fn()} onMenu={vi.fn()} />);
    expect(screen.getByText('Соната')).toBeInTheDocument();
    expect(screen.getByText('2:05')).toBeInTheDocument();
  });

  // The MVP screen put the open handler on the <span> with the name: a tap on
  // the duration, on a badge, or on the card's padding did nothing at all. The
  // whole card is one button now, and this pins it.
  it('the whole card is one open target, not just the name', () => {
    const onOpen = vi.fn();
    render(<TrackCard track={track} onOpen={onOpen} onMenu={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Соната' }));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('opens the action menu without opening the track', () => {
    const onOpen = vi.fn();
    const onMenu = vi.fn();
    render(<TrackCard track={track} onOpen={onOpen} onMenu={onMenu} />);
    fireEvent.click(screen.getByRole('button', { name: /действия/i }));
    expect(onMenu).toHaveBeenCalledWith('a');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows where the user stopped, and the non-default settings', () => {
    render(<TrackCard track={track} state={state} onOpen={vi.fn()} onMenu={vi.fn()} />);
    expect(screen.getByText('1:02')).toBeInTheDocument(); // lastPosition
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('−2')).toBeInTheDocument();
    expect(screen.getByText('A–B')).toBeInTheDocument();
  });

  // A track that was never opened must look untouched: no resume time, no
  // badges, and a wave with nothing filled in.
  it('shows no resume time and no badges for a fresh track', () => {
    const { container } = render(<TrackCard track={track} onOpen={vi.fn()} onMenu={vi.fn()} />);
    expect(screen.queryByText('90%')).toBeNull();
    expect(container.querySelectorAll('rect.played')).toHaveLength(0);
    expect(container.querySelector('.resume')).toBeNull();
  });

  // Defaults must not produce badges either — an opened-but-unchanged track is
  // as clean as a fresh one.
  it('shows no badges when every setting is at its default', () => {
    const fresh: TrackStateRecord = {
      trackId: 'a', tempo: 1, pitch: 0, loopStart: null, loopEnd: null,
      pxPerSec: 100, markers: [], lastPosition: 30,
    };
    const { container } = render(
      <TrackCard track={track} state={fresh} onOpen={vi.fn()} onMenu={vi.fn()} />,
    );
    expect(container.querySelectorAll('.badge')).toHaveLength(0);
    expect(screen.getByText('0:30')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/TrackCard.test.tsx`
Expected: FAIL — cannot resolve `./TrackCard`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/TrackCard.tsx`:

```tsx
import type { TrackRecord, TrackStateRecord } from '../types';
import { TrackWave } from './TrackWave';
import { fmtTime } from './time';
import { progressRatio, tempoBadge, pitchBadge, loopBadge } from './libraryModel';

interface Props {
  track: TrackRecord;
  /** undefined = the track was never opened. */
  state?: TrackStateRecord;
  onOpen(id: string): void;
  onMenu(id: string): void;
}

export function TrackCard({ track, state, onOpen, onMenu }: Props) {
  const lastPosition = state?.lastPosition ?? 0;
  const badges = [
    tempoBadge(state?.tempo ?? 1),
    pitchBadge(state?.pitch ?? 0),
    loopBadge(state?.loopStart ?? null, state?.loopEnd ?? null),
  ].filter((b): b is string => b !== null);

  return (
    <div className="track-card">
      {/* Stretched hit area covering the whole card. The MVP screen hung the
          handler on the name's <span>, so a tap on the duration or on the
          padding silently did nothing. Empty on purpose: the visible content
          is .body, which paints above it and takes no pointer events. */}
      <button className="open" aria-label={track.name} onClick={() => onOpen(track.id)} />

      <div className="body">
        <div className="row">
          <span className="name">{track.name}</span>
          <span className="dur">{fmtTime(track.duration)}</span>
        </div>

        <TrackWave peaks={track.peaks} progress={progressRatio(lastPosition, track.duration)} />

        <div className="row meta">
          {lastPosition > 0 && <span className="resume">{fmtTime(lastPosition)}</span>}
          {badges.map((b) => (
            <span key={b} className="badge">{b}</span>
          ))}
        </div>
      </div>

      <button
        className="menu"
        aria-label={`действия: ${track.name}`}
        onClick={() => onMenu(track.id)}
      >
        ⋯
      </button>
    </div>
  );
}
```

Append to the `/* ── Library ── */` section of `src/ui/styles.css`:

```css
.track-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}

/* The stretched open target. Three things are load-bearing:
   - `inset: 0` makes the WHOLE card tappable (the MVP row only reacted to a
     tap on the name itself);
   - the global `button` rule paints var(--elevated) and forces a 48px min box,
     both of which must be cleared here;
   - it sits BELOW .body in z-order, so its :active background shows as press
     feedback *under* the text instead of covering it. */
.track-card .open {
  position: absolute;
  inset: 0;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  background: transparent;
  border-radius: var(--r-lg);
}
.track-card .open:active { background: var(--elevated); filter: none; }

/* Positioned so it paints above .open; pointer-events: none so every tap on the
   text falls through to it. */
.track-card .body {
  position: relative;
  z-index: 2;
  flex: 1;
  min-width: 0;
  pointer-events: none;
}

/* Above .body, and the only thing inside the card that is NOT the open target. */
.track-card .menu {
  position: relative;
  z-index: 3;
  background: transparent;
  color: var(--muted);
  font-size: 22px;
}

.track-card .row { display: flex; align-items: baseline; gap: 8px; }
.track-card .name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 17px;
}
.track-card .dur {
  color: var(--muted);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
/* min-height keeps every card the same height whether or not it has badges —
   a list that reflows as you use it is a list you can't tap blind. */
.track-card .meta { gap: 6px; margin-top: 6px; min-height: 20px; }
.track-card .resume {
  color: var(--accent);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.track-card .badge {
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  color: var(--muted);
  font-size: 11px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/TrackCard.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/TrackCard.tsx src/ui/TrackCard.test.tsx src/ui/styles.css
git commit -m "feat(ui): TrackCard — whole card is the open target, with progress and badges"
```

---

### Task 8: `TrackSheet` + the layer order

**Files:**
- Create: `src/ui/TrackSheet.tsx`
- Create: `src/ui/libraryLayers.test.ts`
- Modify: `src/ui/styles.css` (append to the `/* ── Library ── */` section)
- Test: `src/ui/TrackSheet.test.tsx`

**Interfaces:**
- Produces:

```ts
interface TrackSheetProps {
  track: TrackRecord;
  onDelete(id: string): void;
  onClose(): void;
}
```

Used by `Library` (Task 12).

**The layer rule — read this before writing the CSS.** In the player, the dock's rows deliberately sit **above** `.backdrop`. Here the rule is **inverted**: the sheet's backdrop must paint **above** the header and the FAB. Otherwise, with a sheet open, a tap on `＋` opens the file picker instead of closing the sheet. jsdom does not hit-test stacking contexts (RTL dispatches straight at the node), so this is pinned by reading `styles.css` — exactly like `ControlTabs.test.tsx` does.

Final z-order: `.library-header` and `.import-fab` at `30`, `.sheet-backdrop` at `40`, `.sheet` at `50`. This task writes the sheet and its two `40`/`50` rules. The header's and the FAB's `30` arrive in Tasks 11 and 12, so **the layers test that compares all three lives in Task 12** — it cannot pass before the selectors it reads exist.

- [ ] **Step 1: Write the failing test**

Create `src/ui/TrackSheet.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TrackSheet } from './TrackSheet';
import type { TrackRecord } from '../types';

const track: TrackRecord = {
  id: 'a', name: 'Соната', blob: new Blob(), peaks: new Float32Array(),
  duration: 60, createdAt: 1,
};

describe('TrackSheet', () => {
  afterEach(cleanup);

  it('names the track it is about', () => {
    render(<TrackSheet track={track} onDelete={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Соната' })).toBeInTheDocument();
  });

  // The confirmation IS the sheet — there is no second dialog, and confirm()
  // is gone (in an installed PWA it looks like an alien system prompt).
  it('deletes on the destructive button', () => {
    const onDelete = vi.fn();
    render(<TrackSheet track={track} onDelete={onDelete} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onDelete).toHaveBeenCalledWith('a');
  });

  it('cancels without deleting', () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(<TrackSheet track={track} onDelete={onDelete} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onClose).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('closes on a tap outside, without deleting', () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <TrackSheet track={track} onDelete={onDelete} onClose={onClose} />,
    );
    fireEvent.click(container.querySelector('.sheet-backdrop')!);
    expect(onClose).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/TrackSheet.test.tsx`
Expected: FAIL — cannot resolve `./TrackSheet`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/TrackSheet.tsx`:

```tsx
import type { TrackRecord } from '../types';

interface Props {
  track: TrackRecord;
  onDelete(id: string): void;
  onClose(): void;
}

// Replaces the native confirm(): in an installed PWA a system dialog reads as
// something that escaped from another app. The sheet IS the confirmation —
// there is no second "are you sure".
export function TrackSheet({ track, onDelete, onClose }: Props) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={track.name}>
        <div className="sheet-title">{track.name}</div>
        <button className="danger" onClick={() => onDelete(track.id)}>
          Удалить
        </button>
        <button onClick={onClose}>Отмена</button>
      </div>
    </>
  );
}
```

Append to the `/* ── Library ── */` section of `src/ui/styles.css`:

```css
/* The sheet's backdrop must paint ABOVE the header and the FAB — the OPPOSITE
   of the player's dock, where every row deliberately clears .backdrop. With a
   sheet open, a tap on ＋ must close the sheet, not open the file picker; a tap
   on the theme swatch must close it, not switch the palette. jsdom cannot
   hit-test stacking contexts, so libraryLayers.test.ts pins this by reading the
   z-index values straight out of this file. Order: header/FAB 30 < backdrop 40
   < sheet 50. */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.5);
}
.sheet {
  position: fixed;
  right: 8px;
  bottom: 0;
  left: 8px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  /* Standalone on iOS is full-bleed: without the inset the last button sits
     under the home indicator. */
  padding-bottom: calc(14px + env(safe-area-inset-bottom));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.45);
}
.sheet-title {
  overflow: hidden;
  padding: 2px 2px 6px;
  color: var(--muted);
  font-size: 14px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.sheet button { height: 56px; font-size: 16px; border-radius: var(--r-md); }
.sheet button.danger { background: var(--danger); color: #fff; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/TrackSheet.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/TrackSheet.tsx src/ui/TrackSheet.test.tsx src/ui/styles.css
git commit -m "feat(ui): TrackSheet — an action sheet in place of the native confirm()"
```

---

### Task 9: `ImportButton` + `importAccept`

**Files:**
- Create: `src/ui/importAccept.ts`
- Create: `src/ui/ImportButton.tsx`
- Test: `src/ui/importAccept.test.ts`
- Test: `src/ui/ImportButton.test.tsx`

**Interfaces:**
- Produces:
  - `AUDIO_ACCEPT: string` (from `./importAccept`) — moved **verbatim**, comment included, out of `Library.tsx`.
  - `<ImportButton className={string} label={string} onPick={(file: File) => void}>{children}</ImportButton>` — renders a hidden `<input type="file">` plus the button that clicks it. Used twice: as the FAB (Task 12) and as the empty-state CTA (Task 11).

**Why one component used twice:** the FAB and the empty-state CTA both need a file input. Two components each owning their own input would be the same twelve lines copied — and `AUDIO_ACCEPT` is exactly the constant you do not want two copies of.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/importAccept.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AUDIO_ACCEPT } from './importAccept';

describe('AUDIO_ACCEPT', () => {
  // iOS maps the `accept` attribute onto UTIs to decide which files the picker
  // lets you tap. The bare `audio/*` wildcard does NOT resolve to the mp3 UTI
  // there, so real .mp3 files render greyed out and import is impossible — hit
  // on a real iPhone. The explicit extensions must stay.
  it('lists explicit audio extensions, not just the audio/* wildcard', () => {
    for (const ext of ['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg']) {
      expect(AUDIO_ACCEPT).toContain(ext);
    }
  });
});
```

Create `src/ui/ImportButton.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ImportButton } from './ImportButton';

describe('ImportButton', () => {
  afterEach(cleanup);

  it('offers the audio extensions iOS needs on its file input', () => {
    const { container } = render(
      <ImportButton className="import-fab" label="импорт" onPick={vi.fn()}>＋</ImportButton>,
    );
    const accept = container.querySelector('input[type="file"]')!.getAttribute('accept') ?? '';
    for (const ext of ['.mp3', '.m4a', '.wav']) {
      expect(accept).toContain(ext);
    }
  });

  it('hands the picked file to onPick', () => {
    const onPick = vi.fn();
    const { container } = render(
      <ImportButton className="import-fab" label="импорт" onPick={onPick}>＋</ImportButton>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new ArrayBuffer(8)], 'a.mp3', { type: 'audio/mpeg' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onPick).toHaveBeenCalledWith(file);
  });

  // Picking the SAME file twice fires no change event unless the value is
  // cleared — the second import would silently do nothing.
  it('clears the input so the same file can be picked again', () => {
    const { container } = render(
      <ImportButton className="import-fab" label="импорт" onPick={vi.fn()}>＋</ImportButton>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([new ArrayBuffer(8)], 'a.mp3')] },
    });
    expect(input.value).toBe('');
  });

  it('is labelled for screen readers', () => {
    render(<ImportButton className="import-fab" label="импорт" onPick={vi.fn()}>＋</ImportButton>);
    expect(screen.getByRole('button', { name: 'импорт' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/importAccept.test.ts src/ui/ImportButton.test.tsx`
Expected: FAIL — cannot resolve `./importAccept` / `./ImportButton`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/importAccept.ts` — **copy the constant and its comment verbatim** from `src/screens/Library.tsx:5-33`:

```ts
// iOS turns `accept` into a UTI filter and greys out anything that does not
// match. The bare `audio/*` wildcard does NOT resolve to the mp3 UTI there, so
// real .mp3 files were untappable and import was impossible on iPhone (hit on a
// real device). Explicit extensions and concrete MIME types map to UTIs far more
// reliably. The list only ever widens what the picker offers, and an undecodable
// pick is already handled — the store catches the decodeAudioData rejection and
// shows an error banner.
export const AUDIO_ACCEPT = [
  'audio/*',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/ogg',
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.aiff',
  '.aif',
  '.caf',
  '.flac',
  '.ogg',
  '.oga',
  '.opus',
].join(',');
```

Create `src/ui/ImportButton.tsx`:

```tsx
import { useRef, type ReactNode } from 'react';
import { AUDIO_ACCEPT } from './importAccept';

interface Props {
  onPick(file: File): void;
  className: string;
  label: string;
  children: ReactNode;
}

// Both entry points into import — the FAB and the empty-state CTA — need a file
// input. One component, used twice: AUDIO_ACCEPT is not a constant you want two
// copies of.
export function ImportButton({ onPick, className, label, children }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={className} aria-label={label} onClick={() => ref.current?.click()}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept={AUDIO_ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          // Reset, or picking the SAME file twice fires no change event at all.
          e.target.value = '';
        }}
      />
    </>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/importAccept.test.ts src/ui/ImportButton.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/importAccept.ts src/ui/ImportButton.tsx src/ui/importAccept.test.ts src/ui/ImportButton.test.tsx
git commit -m "feat(ui): ImportButton — one file-picker component for the FAB and the CTA"
```

---

### Task 10: `ThemeToggle`

**Files:**
- Create: `src/ui/ThemeToggle.tsx`
- Modify: `src/ui/styles.css` (append to the `/* ── Library ── */` section)
- Test: `src/ui/ThemeToggle.test.tsx`

**Interfaces:**
- Consumes: `loadThemeName()`, `setThemeName(name)`, `ThemeName` (Task 3).
- Produces: `<ThemeToggle />` — no props. Used by `LibraryHeader` (Task 11).

**Design:** a round swatch filled with `var(--accent)` — i.e. the **current** theme's accent (amber for `warm`, blue for `studio`). Tapping toggles; the swatch, and the entire screen, recolour at once. No sun/moon icon: both palettes are dark, so that metaphor would be a lie. The theme is **not** in the store — `theme.ts` owns it, and the component keeps the name in local state.

- [ ] **Step 1: Write the failing test**

Create `src/ui/ThemeToggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';
import { applyTheme } from './theme';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.removeItem('razbor.theme');
    applyTheme('warm');
  });
  afterEach(() => {
    cleanup();
    localStorage.removeItem('razbor.theme');
  });

  // The whole point: until now `studio` was reachable only by typing into the
  // browser console.
  it('switches the palette and persists the choice', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /тема/i }));

    expect(document.documentElement.dataset.theme).toBe('studio');
    expect(localStorage.getItem('razbor.theme')).toBe('studio');
  });

  it('switches back', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: /тема/i });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(document.documentElement.dataset.theme).toBe('warm');
    expect(localStorage.getItem('razbor.theme')).toBe('warm');
  });

  it('starts from the stored theme, not from the default', () => {
    localStorage.setItem('razbor.theme', 'studio');
    render(<ThemeToggle />);
    // Already on studio, so one tap must go BACK to warm rather than re-apply
    // studio.
    fireEvent.click(screen.getByRole('button', { name: /тема/i }));
    expect(document.documentElement.dataset.theme).toBe('warm');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/ThemeToggle.test.tsx`
Expected: FAIL — cannot resolve `./ThemeToggle`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/ThemeToggle.tsx`:

```tsx
import { useState } from 'react';
import { loadThemeName, setThemeName, type ThemeName } from './theme';

const TITLE: Record<ThemeName, string> = {
  warm: 'тёплая',
  studio: 'студия',
};

// The swatch is filled with var(--accent) — the CURRENT theme's accent. Tapping
// re-stamps <html data-theme>, which re-resolves every variable on the page, so
// the swatch and the whole screen recolour together. Deliberately not a sun/moon
// icon: both palettes are dark, and that metaphor would be a lie.
//
// The theme is NOT store state — theme.ts owns it (it has to run before React
// mounts, from main.tsx). The component only mirrors it.
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>(() => loadThemeName());
  const next: ThemeName = theme === 'warm' ? 'studio' : 'warm';

  return (
    <button
      className="theme-toggle"
      aria-label={`тема: ${TITLE[theme]}`}
      onClick={() => {
        setThemeName(next);
        setTheme(next);
      }}
    >
      <span className="swatch" />
    </button>
  );
}
```

Append to the `/* ── Library ── */` section of `src/ui/styles.css`:

```css
.theme-toggle { background: transparent; }
.theme-toggle .swatch {
  display: block;
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-radius: 50%;
  background: var(--accent);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/ThemeToggle.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ThemeToggle.tsx src/ui/ThemeToggle.test.tsx src/ui/styles.css
git commit -m "feat(ui): ThemeToggle — the studio palette is finally reachable without the console"
```

---

### Task 11: `LibraryHeader` + `EmptyLibrary`

**Files:**
- Create: `src/ui/LibraryHeader.tsx`
- Create: `src/ui/EmptyLibrary.tsx`
- Modify: `src/ui/styles.css` (append to the `/* ── Library ── */` section)
- Test: `src/ui/libraryChrome.test.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` (Task 10), `ImportButton` (Task 9).
- Produces:
  - `<LibraryHeader />` — no props.
  - `<EmptyLibrary onPick={(file: File) => void} />`.

  Both used by `Library` (Task 12).

**Note on the header's `z-index: 30`:** it is not decoration. The sheet's backdrop is `z-index: 40` and must paint over the header, so the header has to declare a stacking level for the layers test (Task 12) to compare against. A `position: relative` is required for `z-index` to have any effect at all.

- [ ] **Step 1: Write the failing test**

Create `src/ui/libraryChrome.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LibraryHeader } from './LibraryHeader';
import { EmptyLibrary } from './EmptyLibrary';

describe('LibraryHeader', () => {
  afterEach(cleanup);

  it('names the app and offers the theme toggle', () => {
    render(<LibraryHeader />);
    expect(screen.getByRole('heading', { name: 'Разбор' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /тема/i })).toBeInTheDocument();
  });
});

describe('EmptyLibrary', () => {
  afterEach(cleanup);

  // The MVP empty screen was a grey paragraph with no way out of it: the only
  // import control was a small button in the header.
  it('offers a call to action, not just a sentence', () => {
    render(<EmptyLibrary onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /выбрать аудио/i })).toBeInTheDocument();
  });

  it('hands the picked file straight to onPick', () => {
    const onPick = vi.fn();
    const { container } = render(<EmptyLibrary onPick={onPick} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new ArrayBuffer(8)], 'a.mp3');

    fireEvent.change(input, { target: { files: [file] } });

    expect(onPick).toHaveBeenCalledWith(file);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/libraryChrome.test.tsx`
Expected: FAIL — cannot resolve `./LibraryHeader`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/LibraryHeader.tsx`:

```tsx
import { ThemeToggle } from './ThemeToggle';

export function LibraryHeader() {
  return (
    <header className="library-header">
      <h1>Разбор</h1>
      <ThemeToggle />
    </header>
  );
}
```

Create `src/ui/EmptyLibrary.tsx`:

```tsx
import { ImportButton } from './ImportButton';

interface Props {
  onPick(file: File): void;
}

// The FAB is on screen here too, but an empty screen needs a target you cannot
// miss — the MVP version was a grey paragraph and a small button in the corner.
export function EmptyLibrary({ onPick }: Props) {
  return (
    <div className="empty">
      <p>
        Пока пусто.
        <br />
        Импортируй аудио с телефона.
      </p>
      <ImportButton className="import-cta" label="выбрать аудио" onPick={onPick}>
        ＋ Выбрать аудио
      </ImportButton>
    </div>
  );
}
```

Append to the `/* ── Library ── */` section of `src/ui/styles.css`:

```css
/* z-index is load-bearing, not decoration: .sheet-backdrop (40) must paint OVER
   the header, or a tap on the theme swatch with a sheet open would switch the
   palette instead of closing the sheet. position: relative is what makes the
   z-index apply at all. Pinned by libraryLayers.test.ts. */
.library-header {
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 12px;
  /* Standalone on iOS runs full-bleed (viewport-fit=cover): without the inset
     the title lands under the status bar / notch. env() is 0 elsewhere. */
  padding: calc(10px + env(safe-area-inset-top)) 12px 10px;
}
.library-header h1 {
  flex: 1;
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.3px;
}

.empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 24px;
  color: var(--muted);
  text-align: center;
  line-height: 1.5;
}
.import-cta {
  padding: 0 22px;
  height: 56px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--elevated);
  color: var(--text);
  font-size: 16px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/libraryChrome.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/LibraryHeader.tsx src/ui/EmptyLibrary.tsx src/ui/libraryChrome.test.tsx src/ui/styles.css
git commit -m "feat(ui): LibraryHeader and EmptyLibrary"
```

---

### Task 12: rewrite `Library`, delete the MVP CSS, pin the layers

**Files:**
- Rewrite: `src/screens/Library.tsx`
- Rewrite: `src/screens/Library.test.tsx`
- Create: `src/ui/libraryLayers.test.ts`
- Modify: `src/ui/styles.css` — **delete** `.screen-header`, `.control-row`, `.library-item`; add `.library`, `.track-list`, `.import-fab`

**Interfaces:**
- Consumes: everything built so far — `sortTracks` (2), `trackStates` (5), `TrackCard` (7), `TrackSheet` (8), `ImportButton` (9), `LibraryHeader` + `EmptyLibrary` (11).
- Produces: the finished screen. `AUDIO_ACCEPT` is **no longer exported from this file** — it lives in `src/ui/importAccept.ts`.

- [ ] **Step 1: Write the failing tests**

Rewrite `src/screens/Library.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { Library } from './Library';
import type { TrackRecord } from '../types';

function track(id: string, name: string, createdAt: number): TrackRecord {
  return {
    id,
    name,
    blob: new Blob(),
    peaks: new Float32Array(400).fill(0.5),
    duration: 61,
    createdAt,
  };
}

describe('Library', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      library: [track('a', 'Соната', 1)],
      trackStates: {},
    });
  });
  afterEach(cleanup);

  it('renders track names', () => {
    render(<Library />);
    expect(screen.getByText('Соната')).toBeInTheDocument();
  });

  // db.listTracks() is a bare getAll(): without an explicit sort the list came
  // out in object-store key order, i.e. arbitrary.
  //
  // Read the names out of the DOM, NOT via getAllByRole(name: /…/): the ⋯ button
  // of each card is called "действия: Старая", so a name regex would match two
  // buttons per card and the resulting order would be meaningless.
  it('puts the newest track first', () => {
    usePlayerStore.setState({
      library: [track('a', 'Старая', 1), track('b', 'Новая', 5), track('c', 'Средняя', 3)],
    });
    const { container } = render(<Library />);
    const names = [...container.querySelectorAll('.track-card .name')].map((n) => n.textContent);
    expect(names).toEqual(['Новая', 'Средняя', 'Старая']);
  });

  // The MVP row hung the handler on the name's <span>: a tap on the duration or
  // on the padding did nothing. The whole card is the target now.
  it('opens the track from anywhere on the card', () => {
    const openTrack = vi.fn();
    usePlayerStore.setState({ openTrack });
    render(<Library />);
    fireEvent.click(screen.getByRole('button', { name: 'Соната' }));
    expect(openTrack).toHaveBeenCalledWith('a');
  });

  it('deletes through the sheet, not through a native confirm()', () => {
    const removeTrack = vi.fn();
    usePlayerStore.setState({ removeTrack });
    render(<Library />);

    fireEvent.click(screen.getByRole('button', { name: /действия/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(removeTrack).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancelling the sheet deletes nothing', () => {
    const removeTrack = vi.fn();
    usePlayerStore.setState({ removeTrack });
    render(<Library />);

    fireEvent.click(screen.getByRole('button', { name: /действия/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(removeTrack).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the empty state with a call to action when there are no tracks', () => {
    usePlayerStore.setState({ library: [] });
    render(<Library />);
    expect(screen.getByRole('button', { name: /выбрать аудио/i })).toBeInTheDocument();
  });

  it('the file input accepts explicit audio extensions, not just the audio/* wildcard', () => {
    // iOS maps the `accept` attribute onto UTIs to decide which files the picker
    // lets you tap. The bare `audio/*` wildcard does not resolve to the mp3 UTI
    // there, so real .mp3 files render greyed out and import is impossible —
    // hit on a real iPhone. Explicit extensions map to UTIs far more reliably,
    // so they must stay in the attribute.
    const { container } = render(<Library />);
    const input = container.querySelector('input[type="file"]')!;
    const accept = input.getAttribute('accept') ?? '';
    for (const ext of ['.mp3', '.m4a', '.wav']) {
      expect(accept).toContain(ext);
    }
  });
});
```

Create `src/ui/libraryLayers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import css from './styles.css?raw';

// Same trick as ControlTabs.test.tsx: read the stylesheet, because jsdom does
// not hit-test stacking contexts (RTL dispatches events straight at the node),
// so a backdrop silently covering a button is invisible to every other test.
function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.]/g, '\\.');
  const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`styles.css has no ${selector} rule`);
  return m[1];
}

function cssProp(block: string, prop: string): string | undefined {
  return new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+);`).exec(block)?.[1].trim();
}

describe('library layer order', () => {
  // The INVERSE of the player's dock, where every row deliberately clears
  // .backdrop. Here the sheet's backdrop must cover the header and the FAB: with
  // a sheet open, a tap on ＋ must close the sheet, NOT open the file picker,
  // and a tap on the theme swatch must not switch the palette.
  it.each(['.library-header', '.import-fab'])(
    'keeps %s BELOW the sheet backdrop',
    (selector) => {
      const row = cssBlock(selector);
      const backdrop = cssBlock('.sheet-backdrop');

      const rowPosition = cssProp(row, 'position');
      expect(rowPosition, `${selector} must be positioned for z-index to apply`).toBeTruthy();
      expect(rowPosition).not.toBe('static');

      const rowZ = Number(cssProp(row, 'z-index'));
      const backdropZ = Number(cssProp(backdrop, 'z-index'));
      expect(Number.isNaN(rowZ), `${selector} must declare a z-index`).toBe(false);
      expect(rowZ).toBeLessThan(backdropZ);
    },
  );

  it('keeps the sheet itself above its own backdrop', () => {
    const sheetZ = Number(cssProp(cssBlock('.sheet'), 'z-index'));
    const backdropZ = Number(cssProp(cssBlock('.sheet-backdrop'), 'z-index'));
    expect(sheetZ).toBeGreaterThan(backdropZ);
  });

  // The MVP classes. If any of them comes back, something is rendering the old
  // screen.
  it.each(['.screen-header', '.control-row', '.library-item'])(
    'has no leftover MVP rule %s',
    (selector) => {
      expect(() => cssBlock(selector)).toThrow();
    },
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/screens/Library.test.tsx src/ui/libraryLayers.test.ts`
Expected: FAIL — the old `Library` renders no `⋯` button and no card button; `styles.css` has no `.import-fab` rule and still has `.library-item`.

- [ ] **Step 3: Write the implementation**

Rewrite `src/screens/Library.tsx`:

```tsx
import { useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { sortTracks } from '../ui/libraryModel';
import { LibraryHeader } from '../ui/LibraryHeader';
import { EmptyLibrary } from '../ui/EmptyLibrary';
import { ImportButton } from '../ui/ImportButton';
import { TrackCard } from '../ui/TrackCard';
import { TrackSheet } from '../ui/TrackSheet';

export function Library() {
  // Single-field selectors on purpose: a selector returning a fresh object every
  // call needs useShallow, or zustand v5 throws "getSnapshot should be cached".
  const library = usePlayerStore((s) => s.library);
  const trackStates = usePlayerStore((s) => s.trackStates);
  const importFile = usePlayerStore((s) => s.importFile);
  const openTrack = usePlayerStore((s) => s.openTrack);
  const removeTrack = usePlayerStore((s) => s.removeTrack);

  // Which track's sheet is open is local React state, never the store — the same
  // rule ControlTabs follows for its open tab.
  const [sheetId, setSheetId] = useState<string | null>(null);

  const tracks = sortTracks(library);
  const sheetTrack = tracks.find((t) => t.id === sheetId) ?? null;

  return (
    <div className="library">
      <LibraryHeader />

      {tracks.length === 0 ? (
        <EmptyLibrary onPick={(f) => void importFile(f)} />
      ) : (
        <div className="track-list">
          {tracks.map((t) => (
            <TrackCard
              key={t.id}
              track={t}
              state={trackStates[t.id]}
              onOpen={(id) => void openTrack(id)}
              onMenu={setSheetId}
            />
          ))}
        </div>
      )}

      <ImportButton className="import-fab" label="импорт" onPick={(f) => void importFile(f)}>
        ＋
      </ImportButton>

      {sheetTrack && (
        <TrackSheet
          track={sheetTrack}
          onDelete={(id) => {
            void removeTrack(id);
            setSheetId(null);
          }}
          onClose={() => setSheetId(null)}
        />
      )}
    </div>
  );
}
```

In `src/ui/styles.css`: **delete** the three MVP rules (`.screen-header`, `.control-row`, `.library-item`) and their `/* ── Library (out of scope for this redesign — keep it working) ── */` heading if it is still there. Add to the `/* ── Library ── */` section:

```css
/* dvh, not vh — iOS's collapsing URL bar makes vh too tall (same as .player). */
.library {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

.track-list {
  display: flex;
  flex: 1;
  /* Without min-height: 0 a flex item refuses to shrink below its content and
     the list scrolls the whole page instead of itself. */
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding: 4px 12px;
  /* The FAB floats over the list: without this the last card hides under it. */
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
}

/* z-index 30: BELOW .sheet-backdrop (40). With a sheet open a tap here must
   close the sheet, not open the file picker. See libraryLayers.test.ts. */
.import-fab {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 30;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 28px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — every file, including `App.test.tsx` (which renders `Library` when there is no current track).

If `App.test.tsx` fails on a missing `trackStates`, add `trackStates: {}` to whatever store state it sets up — the field is required now.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Library.tsx src/screens/Library.test.tsx src/ui/libraryLayers.test.ts src/ui/styles.css
git commit -m "feat(ui): rebuild the library screen — cards, action sheet, FAB, theme toggle"
```

---

### Task 13: gates, docs, device check

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/HANDOFF.md`

- [ ] **Step 1: Run every gate**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected: all three clean. `tsc --noEmit` is a **separate** gate — `vite build` uses esbuild, which strips types without checking them, so a type error survives a green build.

- [ ] **Step 2: Verify the bundle**

```bash
grep -o '"scope":"[^"]*"' dist/manifest.webmanifest   # -> /lena-audio-player/
grep -c soundtouch-processor dist/sw.js               # >= 1, or offline is broken
grep -o 'data-theme="[^"]*"' dist/index.html          # -> warm
```

The test suite structurally cannot catch a `base` regression — vitest forces `base: '/'`, so `BASE_URL` is always `'/'` under tests. Only a real build proves this.

- [ ] **Step 3: Update `CLAUDE.md`**

In the **Architecture → UI** section, replace the library sentence with a description of the new screen: `Library` = `LibraryHeader` (title + `ThemeToggle`) + a scrolling list of `TrackCard`s + a fixed `ImportButton` FAB + a `TrackSheet` overlay; which track's sheet is open is local React state, never the store.

Add to **Gotchas / non-obvious** a new item, worded as its own rule:

> **The library's layer order is the inverse of the player's.** In the dock, every row deliberately sits *above* `.backdrop`. On the library, `.sheet-backdrop` (z-index 40) must sit *above* `.library-header` and `.import-fab` (both 30) — otherwise, with a sheet open, a tap on the FAB opens the file picker instead of closing the sheet. Two opposite rules in one stylesheet: check which screen you are on before copying a z-index. Both are pinned by tests that read `styles.css` (`ControlTabs.test.tsx`, `libraryLayers.test.ts`), because jsdom does not hit-test.

Add to **Theming**: the `studio` palette is now reachable from the UI (`ThemeToggle` in the library header) — the "no UI switcher yet" note is obsolete. The library's card waveform is **SVG coloured by CSS variables**, so it re-themes with no redraw, unlike the canvases.

Update the test count in **Commands** to the real number from `npm test`.

- [ ] **Step 4: Update `docs/superpowers/HANDOFF.md`**

Mark the library redesign done, and record what is still **device-only** and unverified:

- does the card's waveform read at 50–70 cm;
- does the sheet's backdrop really swallow the tap on the FAB (the bug the layer test only *approximates*);
- is the header clear of the notch and the FAB clear of the home indicator;
- does the theme toggle recolour the **player's canvases** too, after navigating into a track;
- does an `.mp3` still open from the picker on a real iPhone.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/superpowers/HANDOFF.md
git commit -m "docs: CLAUDE.md and handoff after the library redesign"
```

---

## Device check (trusted HTTPS — the service worker needs a secure context)

```bash
npx vite preview --port 4173 &
cloudflared tunnel --url http://localhost:4173
# open <tunnel>/lena-audio-player/ on the phone
```

Walk through: import an mp3 → the card shows a wave → open it, play, come back → the card shows where you stopped → `⋯` → Отмена → nothing deleted → `⋯` → Удалить → gone → tap the theme swatch → everything, including the player's waveform, recolours.
