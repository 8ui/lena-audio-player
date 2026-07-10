# Audio Player MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Мобильная PWA для пианиста: замедление/ускорение без изменения тона, транспонирование, A-B луп, крупный движущийся waveform, офлайн-библиотека.

**Architecture:** Пять слоёв. Аудио-движок (`SoundTouchEngine`) за интерфейсом `AudioEngine` оборачивает Web Audio граф `BufferSource → SoundTouchNode → gain → destination`. Вся математика (позиция/луп, вьюпорт waveform, пики, параметры) — чистые функции, покрытые unit-тестами. Императивная обёртка движка и React-UI проверяются сборкой/вручную. Состояние — Zustand, персист — IndexedDB.

**Tech Stack:** Vite, React, TypeScript, `@soundtouchjs/audio-worklet`, `idb`, Zustand, `vite-plugin-pwa`, Vitest + `fake-indexeddb` + React Testing Library.

## Global Constraints

- Только мобильные устройства (portrait). Все интерактивные зоны ≥ 44×44px.
- Полностью офлайн после первого открытия (аудио в IndexedDB, оболочка в service worker).
- Диапазоны: темп `0.25`–`1.5`, питч `−12`–`+12` целых полутонов, зум waveform `20`–`400` px/с, зум по умолчанию `100` px/с (окно ~10с при ширине ~1000px CSS-пикселей).
- Движок скрыт за интерфейсом `AudioEngine` (Rubberband — будущая замена, вне MVP).
- Маркеры и мини-карта — вне MVP (поля в схеме есть, UI нет).
- TDD: чистая логика пишется тест-первый. Частые коммиты (один на задачу минимум).

---

## File Structure

```
index.html
package.json
vite.config.ts            # vite + react + PWA + vitest
tsconfig.json
public/
  soundtouch-worklet.js    # процессор из @soundtouchjs/audio-worklet (копия/ссылка)
  icons/                   # PWA иконки 192/512
src/
  main.tsx                 # bootstrap React
  App.tsx                  # роутинг между Library и Player по store
  types.ts                 # доменные типы (Track, TrackState, Marker)
  engine/
    AudioEngine.ts         # интерфейс + типы событий
    params.ts              # clampTempo, clampSemitones, константы
    position.ts            # currentSourceTime (позиция + луп-wrap) — чистая
    SoundTouchEngine.ts    # императивная обёртка Web Audio
  waveform/
    computePeaks.ts        # пики из Float32Array — чистая
    viewport.ts            # timeToX/xToTime/clamp — чистая
    WaveformCanvas.tsx     # движущийся canvas + жесты
  storage/
    db.ts                  # idb: tracks + trackState CRUD
  store/
    usePlayerStore.ts      # zustand: мост engine↔UI↔db
  screens/
    Library.tsx
    Player.tsx
  ui/
    TransportBar.tsx
    TempoControl.tsx
    PitchControl.tsx
    LoopControls.tsx
    styles.css             # тач-размеры, layout
tests/  (совмещены рядом как *.test.ts / в src)
```

---

## Task 1: Scaffold project (Vite + React + TS + Vitest)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/smoke.test.ts`

**Interfaces:**
- Produces: рабочий dev-сервер, `npm test` прогоняет Vitest в jsdom.

- [ ] **Step 1: Init npm + install deps**

```bash
cd /Users/andrejsokolov/Desktop/projects/lena-audio-player
npm init -y
npm i react react-dom zustand idb @soundtouchjs/audio-worklet
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom \
  vitest jsdom @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event fake-indexeddb vite-plugin-pwa
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

- [ ] **Step 4: Write `src/test-setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Write `index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <title>Разбор</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Write `src/App.tsx` and `src/main.tsx`**

```tsx
// src/App.tsx
export default function App() {
  return <div>Разбор — плеер</div>;
}
```

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Write smoke test `src/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Add scripts to `package.json`**

Add to `"scripts"`: `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`, `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 9: Run test**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "chore: scaffold vite react ts vitest"
```

---

## Task 2: Engine params (clamp tempo/pitch)

**Files:**
- Create: `src/engine/params.ts`, `src/engine/params.test.ts`

**Interfaces:**
- Produces: `clamp(v,lo,hi)`, `clampTempo(t):number`, `clampSemitones(n):number`, constants `TEMPO_MIN/MAX/DEFAULT`, `SEMITONES_MIN/MAX`.

- [ ] **Step 1: Write failing test `src/engine/params.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { clampTempo, clampSemitones, clamp } from './params';

describe('params', () => {
  it('clamps generic values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it('clamps tempo to 0.25..1.5', () => {
    expect(clampTempo(0.1)).toBe(0.25);
    expect(clampTempo(2)).toBe(1.5);
    expect(clampTempo(0.8)).toBe(0.8);
  });
  it('clamps and rounds semitones to -12..12 integers', () => {
    expect(clampSemitones(13)).toBe(12);
    expect(clampSemitones(-20)).toBe(-12);
    expect(clampSemitones(2.4)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/params.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/engine/params.ts`**

```ts
export const TEMPO_MIN = 0.25;
export const TEMPO_MAX = 1.5;
export const TEMPO_DEFAULT = 1;
export const SEMITONES_MIN = -12;
export const SEMITONES_MAX = 12;

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const clampTempo = (t: number): number => clamp(t, TEMPO_MIN, TEMPO_MAX);

export const clampSemitones = (n: number): number =>
  clamp(Math.round(n), SEMITONES_MIN, SEMITONES_MAX);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/params.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: engine param clamps"
```

---

## Task 3: Position + loop math (pure)

**Files:**
- Create: `src/engine/position.ts`, `src/engine/position.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface PositionParams {
    startOffset: number;   // source-seconds at source.start()
    elapsed: number;       // ctx.currentTime - startCtxTime (real seconds >= 0)
    tempo: number;         // playbackRate applied to source
    duration: number;      // buffer duration seconds
    loopStart: number | null;
    loopEnd: number | null;
  }
  function currentSourceTime(p: PositionParams): { time: number; ended: boolean }
  ```
- Consumed by `SoundTouchEngine` (Task 7) and the store tick (Task 8).

- [ ] **Step 1: Write failing test `src/engine/position.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { currentSourceTime } from './position';

const base = { startOffset: 0, tempo: 1, duration: 100, loopStart: null, loopEnd: null };

describe('currentSourceTime', () => {
  it('advances linearly with elapsed at tempo 1', () => {
    expect(currentSourceTime({ ...base, elapsed: 10 }).time).toBeCloseTo(10);
  });
  it('scales advance by tempo', () => {
    expect(currentSourceTime({ ...base, elapsed: 10, tempo: 0.5 }).time).toBeCloseTo(5);
  });
  it('respects startOffset', () => {
    expect(currentSourceTime({ ...base, startOffset: 20, elapsed: 5 }).time).toBeCloseTo(25);
  });
  it('clamps to duration and reports ended when past end without loop', () => {
    const r = currentSourceTime({ ...base, elapsed: 200 });
    expect(r.time).toBeCloseTo(100);
    expect(r.ended).toBe(true);
  });
  it('wraps inside loop region', () => {
    // loop [10,20], start at 10, elapsed 25 => raw 35 => (35-10)%10=5 => 15
    const r = currentSourceTime({
      ...base, startOffset: 10, elapsed: 25, loopStart: 10, loopEnd: 20,
    });
    expect(r.time).toBeCloseTo(15);
    expect(r.ended).toBe(false);
  });
  it('does not end while looping past duration boundary', () => {
    const r = currentSourceTime({
      ...base, startOffset: 90, elapsed: 30, loopStart: 90, loopEnd: 95,
    });
    expect(r.ended).toBe(false);
    expect(r.time).toBeGreaterThanOrEqual(90);
    expect(r.time).toBeLessThan(95);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/position.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/engine/position.ts`**

```ts
export interface PositionParams {
  startOffset: number;
  elapsed: number;
  tempo: number;
  duration: number;
  loopStart: number | null;
  loopEnd: number | null;
}

export function currentSourceTime(p: PositionParams): { time: number; ended: boolean } {
  const raw = p.startOffset + Math.max(0, p.elapsed) * p.tempo;
  const hasLoop =
    p.loopStart !== null && p.loopEnd !== null && p.loopEnd > p.loopStart;

  if (hasLoop) {
    const a = p.loopStart as number;
    const b = p.loopEnd as number;
    if (raw < b) return { time: Math.max(a, Math.min(raw, b)), ended: false };
    const span = b - a;
    return { time: a + ((raw - a) % span), ended: false };
  }

  if (raw >= p.duration) return { time: p.duration, ended: true };
  return { time: raw, ended: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/position.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: source position and loop-wrap math"
```

---

## Task 4: Waveform viewport math (pure)

**Files:**
- Create: `src/waveform/viewport.ts`, `src/waveform/viewport.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function timeToX(t, currentTime, pxPerSec, width): number
  function xToTime(x, currentTime, pxPerSec, width): number
  function clampPxPerSec(v): number      // 20..400
  function panDeltaToTime(deltaXpx, pxPerSec): number
  const PX_PER_SEC_MIN, PX_PER_SEC_MAX, PX_PER_SEC_DEFAULT
  ```
- Consumed by `WaveformCanvas` (Task 9).

- [ ] **Step 1: Write failing test `src/waveform/viewport.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { timeToX, xToTime, clampPxPerSec, panDeltaToTime } from './viewport';

describe('viewport', () => {
  it('places currentTime at center', () => {
    expect(timeToX(30, 30, 100, 1000)).toBeCloseTo(500);
  });
  it('offsets future time to the right', () => {
    expect(timeToX(31, 30, 100, 1000)).toBeCloseTo(600);
  });
  it('xToTime is inverse of timeToX', () => {
    const x = timeToX(42, 30, 137, 1000);
    expect(xToTime(x, 30, 137, 1000)).toBeCloseTo(42);
  });
  it('clamps zoom', () => {
    expect(clampPxPerSec(5)).toBe(20);
    expect(clampPxPerSec(9999)).toBe(400);
    expect(clampPxPerSec(100)).toBe(100);
  });
  it('drag right moves playback earlier (negative time delta)', () => {
    // dragging waveform right by 100px at 100px/s => -1s
    expect(panDeltaToTime(100, 100)).toBeCloseTo(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/waveform/viewport.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/waveform/viewport.ts`**

```ts
export const PX_PER_SEC_MIN = 20;
export const PX_PER_SEC_MAX = 400;
export const PX_PER_SEC_DEFAULT = 100;

export const timeToX = (t: number, currentTime: number, pxPerSec: number, width: number): number =>
  width / 2 + (t - currentTime) * pxPerSec;

export const xToTime = (x: number, currentTime: number, pxPerSec: number, width: number): number =>
  currentTime + (x - width / 2) / pxPerSec;

export const clampPxPerSec = (v: number): number =>
  Math.min(PX_PER_SEC_MAX, Math.max(PX_PER_SEC_MIN, v));

// Drag waveform right (+deltaX) => scroll back in time (earlier).
export const panDeltaToTime = (deltaXpx: number, pxPerSec: number): number =>
  -deltaXpx / pxPerSec;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/waveform/viewport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: waveform viewport math"
```

---

## Task 5: computePeaks (pure)

**Files:**
- Create: `src/waveform/computePeaks.ts`, `src/waveform/computePeaks.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // Returns interleaved [min0,max0,min1,max1,...] per time bucket.
  function computePeaks(channel: Float32Array, sampleRate: number, samplesPerSecond?: number): Float32Array
  const PEAKS_RESOLUTION // default samplesPerSecond
  ```
- Consumed by import flow (Task 8) and `WaveformCanvas` (Task 9).

- [ ] **Step 1: Write failing test `src/waveform/computePeaks.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computePeaks } from './computePeaks';

describe('computePeaks', () => {
  it('produces one min/max pair per bucket', () => {
    // 1000 samples, sampleRate 1000 => 1s. resolution 200/s => bucket 5 samples => 200 buckets.
    const ch = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) ch[i] = Math.sin(i);
    const peaks = computePeaks(ch, 1000, 200);
    expect(peaks.length).toBe(200 * 2);
  });
  it('captures min and max of a bucket', () => {
    const ch = new Float32Array([-0.5, 0.9, 0.1, 0.2, -0.3]);
    const peaks = computePeaks(ch, 5, 1); // 1 bucket of 5 samples
    expect(peaks[0]).toBeCloseTo(-0.5); // min
    expect(peaks[1]).toBeCloseTo(0.9);  // max
  });
  it('handles empty channel', () => {
    expect(computePeaks(new Float32Array(0), 44100, 200).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/waveform/computePeaks.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/waveform/computePeaks.ts`**

```ts
export const PEAKS_RESOLUTION = 200; // buckets per second

export function computePeaks(
  channel: Float32Array,
  sampleRate: number,
  samplesPerSecond: number = PEAKS_RESOLUTION,
): Float32Array {
  if (channel.length === 0) return new Float32Array(0);
  const bucketSamples = Math.max(1, Math.round(sampleRate / samplesPerSecond));
  const buckets = Math.ceil(channel.length / bucketSamples);
  const out = new Float32Array(buckets * 2);
  for (let b = 0; b < buckets; b++) {
    const start = b * bucketSamples;
    const end = Math.min(start + bucketSamples, channel.length);
    let min = channel[start];
    let max = channel[start];
    for (let i = start + 1; i < end; i++) {
      const v = channel[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[b * 2] = min;
    out[b * 2 + 1] = max;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/waveform/computePeaks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: computePeaks waveform reduction"
```

---

## Task 6: Storage (IndexedDB via idb)

**Files:**
- Create: `src/types.ts`, `src/storage/db.ts`, `src/storage/db.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  interface Marker { id: string; time: number; label: string }
  interface TrackRecord {
    id: string; name: string; blob: Blob;
    peaks: Float32Array; duration: number; createdAt: number;
  }
  interface TrackStateRecord {
    trackId: string; tempo: number; pitch: number;
    loopStart: number | null; loopEnd: number | null;
    pxPerSec: number; markers: Marker[]; lastPosition: number;
  }
  // db.ts
  function addTrack(t: TrackRecord): Promise<void>
  function listTracks(): Promise<TrackRecord[]>
  function getTrack(id: string): Promise<TrackRecord | undefined>
  function deleteTrack(id: string): Promise<void>   // also deletes its state
  function getState(trackId: string): Promise<TrackStateRecord | undefined>
  function saveState(s: TrackStateRecord): Promise<void>
  function defaultState(trackId: string): TrackStateRecord
  ```

- [ ] **Step 1: Write `src/types.ts`**

```ts
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
```

- [ ] **Step 2: Write failing test `src/storage/db.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { addTrack, listTracks, getTrack, deleteTrack, getState, saveState, defaultState } from './db';
import type { TrackRecord } from '../types';

function makeTrack(id: string): TrackRecord {
  return {
    id, name: `t-${id}`, blob: new Blob(['x']),
    peaks: new Float32Array([0, 1]), duration: 42, createdAt: 1,
  };
}

describe('storage', () => {
  beforeEach(async () => {
    for (const t of await listTracks()) await deleteTrack(t.id);
  });

  it('adds and lists tracks', async () => {
    await addTrack(makeTrack('a'));
    const all = await listTracks();
    expect(all.map((t) => t.id)).toContain('a');
  });

  it('gets a track by id', async () => {
    await addTrack(makeTrack('b'));
    const t = await getTrack('b');
    expect(t?.duration).toBe(42);
  });

  it('saves and restores state', async () => {
    const s = { ...defaultState('c'), tempo: 0.5, pitch: -3 };
    await saveState(s);
    expect((await getState('c'))?.tempo).toBe(0.5);
  });

  it('deleteTrack removes track and its state', async () => {
    await addTrack(makeTrack('d'));
    await saveState(defaultState('d'));
    await deleteTrack('d');
    expect(await getTrack('d')).toBeUndefined();
    expect(await getState('d')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/storage/db.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `src/storage/db.ts`**

```ts
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

export async function saveState(s: TrackStateRecord): Promise<void> {
  await (await db()).put('trackState', s);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/storage/db.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: indexeddb storage for tracks and state"
```

---

## Task 7: SoundTouchEngine (Web Audio shell)

**Files:**
- Create: `src/engine/AudioEngine.ts`, `src/engine/SoundTouchEngine.ts`
- Modify: `public/` (add worklet processor file)

**Interfaces:**
- Consumes: `currentSourceTime` (Task 3), `clampTempo/clampSemitones` (Task 2).
- Produces:
  ```ts
  interface AudioEngine {
    load(buffer: AudioBuffer): Promise<void>;
    play(): void;
    pause(): void;
    seek(seconds: number): void;
    setTempo(rate: number): void;
    setPitchSemitones(n: number): void;
    setLoop(start: number | null, end: number | null): void;
    getCurrentTime(): number;
    getDuration(): number;
    readonly playing: boolean;
    onTimeUpdate?: (t: number) => void;  // optional; store drives its own rAF
    onEnded?: () => void;
    dispose(): void;
  }
  class SoundTouchEngine implements AudioEngine { constructor(ctx?: AudioContext) }
  ```

> This task is imperative Web Audio glue; it is verified by build + a manual browser check (Step 6), not a unit test. All position math it relies on is already unit-tested in Task 3.
>
> **Known limitation:** SoundTouch buffers internally (FIFO), so audible playback
> lags the computed source position by the processing latency — the playhead may
> lead the sound by a few tens of ms, more at extreme stretch. Acceptable for MVP;
> revisit if it hurts transcription accuracy.
>
> **Typings fallback:** if `@soundtouchjs/audio-worklet` ships no types for
> `SoundTouchNode`, add `src/soundtouch.d.ts` with `declare module '@soundtouchjs/audio-worklet';`
> and treat `stNode` as `any` for the AudioParam access (`playbackRate`,
> `pitchSemitones`, `pitch` per the package README).

- [ ] **Step 1: Make the worklet processor available in `public/`**

The `@soundtouchjs/audio-worklet` package ships the processor script that must be
served as a URL and registered. Locate it and copy to `public/`:

```bash
ls node_modules/@soundtouchjs/audio-worklet/dist/
# copy the processor/worklet file (name may be soundtouch-worklet.js or
# soundtouch-processor.js depending on version) into public/
cp node_modules/@soundtouchjs/audio-worklet/dist/soundtouch-worklet.js public/soundtouch-worklet.js
```

If the filename differs, use the actual one and update `WORKLET_URL` below.

- [ ] **Step 2: Write `src/engine/AudioEngine.ts`**

```ts
export interface AudioEngine {
  load(buffer: AudioBuffer): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setTempo(rate: number): void;
  setPitchSemitones(n: number): void;
  setLoop(start: number | null, end: number | null): void;
  getCurrentTime(): number;
  getDuration(): number;
  readonly playing: boolean;
  onTimeUpdate?: (t: number) => void;
  onEnded?: () => void;
  dispose(): void;
}
```

- [ ] **Step 3: Write `src/engine/SoundTouchEngine.ts`**

```ts
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import type { AudioEngine } from './AudioEngine';
import { currentSourceTime } from './position';
import { clampTempo, clampSemitones } from './params';

const WORKLET_URL = '/soundtouch-worklet.js';

export class SoundTouchEngine implements AudioEngine {
  private ctx: AudioContext;
  private gain: GainNode;
  private stNode: SoundTouchNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;

  private tempo = 1;
  private semitones = 0;
  private loopStart: number | null = null;
  private loopEnd: number | null = null;

  private startOffset = 0;      // source-seconds where current run began
  private startCtxTime = 0;     // ctx.currentTime at source.start
  private pausedAt = 0;         // last known source position while paused
  playing = false;

  private stopping = false;     // suppress onended during manual stop
  private registered = false;

  onTimeUpdate?: (t: number) => void;
  onEnded?: () => void;

  constructor(ctx?: AudioContext) {
    this.ctx = ctx ?? new AudioContext();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
  }

  async load(buffer: AudioBuffer): Promise<void> {
    if (!this.registered) {
      await SoundTouchNode.register(this.ctx, WORKLET_URL);
      this.registered = true;
    }
    this.stopInternal();
    this.buffer = buffer;
    this.pausedAt = 0;
    this.startOffset = 0;
  }

  getDuration(): number {
    return this.buffer?.duration ?? 0;
  }

  // Pure: no side effects. Natural end is handled by source.onended (below),
  // not here — this is polled ~60/s and must never mutate engine state.
  getCurrentTime(): number {
    if (!this.playing) return this.pausedAt;
    const { time } = currentSourceTime({
      startOffset: this.startOffset,
      elapsed: this.ctx.currentTime - this.startCtxTime,
      tempo: this.tempo,
      duration: this.getDuration(),
      loopStart: this.loopStart,
      loopEnd: this.loopEnd,
    });
    return time;
  }

  play(): void {
    if (!this.buffer || this.playing) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.startSource(this.pausedAt);
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedAt = this.getCurrentTime();
    this.playing = false;
    this.stopInternal();
  }

  seek(seconds: number): void {
    const t = Math.max(0, Math.min(seconds, this.getDuration()));
    this.pausedAt = t;
    if (this.playing) {
      this.stopInternal();
      this.startSource(t);
    }
  }

  setTempo(rate: number): void {
    const next = clampTempo(rate);
    if (this.source && this.stNode) {
      // Capture position under the CURRENT tempo, THEN re-anchor and switch.
      // (getCurrentTime still reads the old this.tempo here — order matters.)
      const pos = this.getCurrentTime();
      this.startOffset = pos;
      this.pausedAt = pos;
      this.startCtxTime = this.ctx.currentTime;
      this.source.playbackRate.value = next;
      this.stNode.playbackRate.value = next;
    }
    this.tempo = next;
  }

  setPitchSemitones(n: number): void {
    this.semitones = clampSemitones(n);
    if (this.stNode) this.stNode.pitchSemitones.value = this.semitones;
  }

  setLoop(start: number | null, end: number | null): void {
    this.loopStart = start;
    this.loopEnd = end;
    if (this.source) {
      const on = start !== null && end !== null && end > start;
      this.source.loop = on;
      if (on) {
        this.source.loopStart = start as number;
        this.source.loopEnd = end as number;
      }
    }
  }

  private startSource(offset: number): void {
    if (!this.buffer) return;
    this.stNode = new SoundTouchNode({ context: this.ctx });
    this.stNode.connect(this.gain);
    this.stNode.playbackRate.value = this.tempo;
    this.stNode.pitchSemitones.value = this.semitones;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.tempo;
    const on = this.loopStart !== null && this.loopEnd !== null && this.loopEnd > this.loopStart;
    src.loop = on;
    if (on) {
      src.loopStart = this.loopStart as number;
      src.loopEnd = this.loopEnd as number;
    }
    src.connect(this.stNode);
    src.onended = () => {
      if (this.stopping) return;
      this.playing = false;
      this.pausedAt = this.getDuration();
      this.onEnded?.();
    };
    src.start(0, offset);

    this.source = src;
    this.startOffset = offset;
    this.startCtxTime = this.ctx.currentTime;
  }

  private stopInternal(): void {
    this.stopping = true;
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source?.disconnect();
    this.stNode?.disconnect();
    this.source = null;
    this.stNode = null;
    this.stopping = false;
  }

  dispose(): void {
    this.stopInternal();
    this.gain.disconnect();
    void this.ctx.close();
  }
}
```

- [ ] **Step 4: Build check (type-safety)**

Run: `npx tsc --noEmit`
Expected: no type errors. (If `SoundTouchNode` typings differ in the installed
version, adjust the AudioParam access accordingly — the params `playbackRate`,
`pitchSemitones` are per the package README.)

- [ ] **Step 5: Wire a throwaway dev harness in `App.tsx`**

Temporarily replace `App.tsx` body with a file `<input type="file" accept="audio/*">`
that decodes via `ctx.decodeAudioData`, calls `engine.load`, and buttons for
play/pause, tempo 0.5, pitch −3, loop [5,8]. (Removed in Task 12.)

- [ ] **Step 6: Manual verify in browser**

Run: `npm run dev`, open on a phone (or desktop), load an audio file.
Expected observations:
- Play/pause works.
- Tempo 0.5 → half speed, pitch unchanged.
- Pitch −3 → lower pitch, same speed.
- Loop [5,8] → repeats that region.
- `engine.getCurrentTime()` advances and matches audible position.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: SoundTouchEngine web audio wrapper"
```

---

## Task 8: Player store (Zustand) + import/open flow

**Files:**
- Create: `src/store/usePlayerStore.ts`, `src/store/usePlayerStore.test.ts`

**Interfaces:**
- Consumes: storage (Task 6), engine interface (Task 7), computePeaks (Task 5), params (Task 2).
- Produces:
  ```ts
  interface PlayerState {
    library: TrackRecord[];
    currentTrackId: string | null;
    peaks: Float32Array | null;
    duration: number;
    playing: boolean;
    position: number;
    tempo: number; pitch: number;
    loopStart: number | null; loopEnd: number | null;
    pxPerSec: number;
    // actions
    init(): Promise<void>;
    importFile(file: File): Promise<void>;
    openTrack(id: string): Promise<void>;
    removeTrack(id: string): Promise<void>;
    closeTrack(): void;
    togglePlay(): void;
    seek(t: number): void;
    setTempo(t: number): void;
    setPitch(n: number): void;
    setLoopA(): void; setLoopB(): void; clearLoop(): void;
    setPxPerSec(v: number): void;
    tick(): void;   // called each rAF while playing
  }
  ```
- Engine + AudioContext are created lazily inside the store (module-level singletons) so decode can share the context.

- [ ] **Step 1: Write failing test `src/store/usePlayerStore.test.ts`**

Tests focus on pure state transitions with a fake engine injected. Add a
`__setEngineFactory` hook to the store for test injection.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { usePlayerStore, __setEngineFactory } from './usePlayerStore';
import type { AudioEngine } from '../engine/AudioEngine';

function fakeEngine(): AudioEngine {
  let playing = false;
  return {
    load: async () => {},
    play: () => { playing = true; },
    pause: () => { playing = false; },
    seek: () => {},
    setTempo: () => {},
    setPitchSemitones: () => {},
    setLoop: () => {},
    getCurrentTime: () => 0,
    getDuration: () => 100,
    get playing() { return playing; },
    dispose: () => {},
  };
}

describe('player store', () => {
  beforeEach(() => {
    __setEngineFactory(fakeEngine);
    usePlayerStore.setState({
      library: [], currentTrackId: null, peaks: null, duration: 0,
      playing: false, position: 0, tempo: 1, pitch: 0,
      loopStart: null, loopEnd: null, pxPerSec: 100,
    });
  });

  it('clamps tempo through setTempo', () => {
    usePlayerStore.getState().setTempo(5);
    expect(usePlayerStore.getState().tempo).toBe(1.5);
  });

  it('clamps pitch through setPitch', () => {
    usePlayerStore.getState().setPitch(-99);
    expect(usePlayerStore.getState().pitch).toBe(-12);
  });

  it('setLoopA then setLoopB records region from current position', () => {
    usePlayerStore.setState({ position: 5 });
    usePlayerStore.getState().setLoopA();
    usePlayerStore.setState({ position: 9 });
    usePlayerStore.getState().setLoopB();
    expect(usePlayerStore.getState().loopStart).toBe(5);
    expect(usePlayerStore.getState().loopEnd).toBe(9);
  });

  it('clearLoop resets region', () => {
    usePlayerStore.setState({ loopStart: 1, loopEnd: 2 });
    usePlayerStore.getState().clearLoop();
    expect(usePlayerStore.getState().loopStart).toBeNull();
  });

  it('togglePlay flips playing', () => {
    usePlayerStore.setState({ currentTrackId: 'x' });
    usePlayerStore.getState().togglePlay();
    expect(usePlayerStore.getState().playing).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/usePlayerStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/store/usePlayerStore.ts`**

```ts
import { create } from 'zustand';
import type { AudioEngine } from '../engine/AudioEngine';
import { SoundTouchEngine } from '../engine/SoundTouchEngine';
import { clampTempo, clampSemitones } from '../engine/params';
import { computePeaks } from '../waveform/computePeaks';
import { clampPxPerSec, PX_PER_SEC_DEFAULT } from '../waveform/viewport';
import * as db from '../storage/db';
import type { TrackRecord } from '../types';

let sharedCtx: AudioContext | null = null;
function ctx(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}

let engineFactory: () => AudioEngine = () => new SoundTouchEngine(ctx());
let engine: AudioEngine | null = null;

export function __setEngineFactory(f: () => AudioEngine) {
  engineFactory = f;
  engine = null;
}

function ensureEngine(): AudioEngine {
  if (!engine) {
    engine = engineFactory();
    engine.onEnded = () => usePlayerStore.setState({ playing: false });
  }
  return engine;
}

interface PlayerState {
  library: TrackRecord[];
  currentTrackId: string | null;
  peaks: Float32Array | null;
  duration: number;
  playing: boolean;
  position: number;
  tempo: number;
  pitch: number;
  loopStart: number | null;
  loopEnd: number | null;
  pxPerSec: number;

  init(): Promise<void>;
  importFile(file: File): Promise<void>;
  openTrack(id: string): Promise<void>;
  removeTrack(id: string): Promise<void>;
  closeTrack(): void;
  togglePlay(): void;
  seek(t: number): void;
  setTempo(t: number): void;
  setPitch(n: number): void;
  setLoopA(): void;
  setLoopB(): void;
  clearLoop(): void;
  setPxPerSec(v: number): void;
  tick(): void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow() {
  const s = usePlayerStore.getState();
  if (!s.currentTrackId) return;
  void db.saveState({
    trackId: s.currentTrackId,
    tempo: s.tempo,
    pitch: s.pitch,
    loopStart: s.loopStart,
    loopEnd: s.loopEnd,
    pxPerSec: s.pxPerSec,
    markers: [],
    lastPosition: s.position,
  });
}

// Debounced: pan/slider drags fire many times a second; coalesce IDB writes.
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 400);
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  library: [],
  currentTrackId: null,
  peaks: null,
  duration: 0,
  playing: false,
  position: 0,
  tempo: 1,
  pitch: 0,
  loopStart: null,
  loopEnd: null,
  pxPerSec: PX_PER_SEC_DEFAULT,

  async init() {
    set({ library: await db.listTracks() });
  },

  async importFile(file) {
    const arr = await file.arrayBuffer();
    const audioBuffer = await ctx().decodeAudioData(arr.slice(0));
    const peaks = computePeaks(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
    const rec: TrackRecord = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, ''),
      blob: file,
      peaks,
      duration: audioBuffer.duration,
      createdAt: Date.now(),
    };
    await db.addTrack(rec);
    set({ library: await db.listTracks() });
  },

  async openTrack(id) {
    const rec = await db.getTrack(id);
    if (!rec) return;
    const e = ensureEngine();
    const arr = await rec.blob.arrayBuffer();
    const audioBuffer = await ctx().decodeAudioData(arr.slice(0));
    await e.load(audioBuffer);
    const st = (await db.getState(id)) ?? db.defaultState(id);
    e.setTempo(st.tempo);
    e.setPitchSemitones(st.pitch);
    e.setLoop(st.loopStart, st.loopEnd);
    e.seek(st.lastPosition);
    set({
      currentTrackId: id,
      peaks: rec.peaks,
      duration: rec.duration,
      tempo: st.tempo,
      pitch: st.pitch,
      loopStart: st.loopStart,
      loopEnd: st.loopEnd,
      pxPerSec: st.pxPerSec,
      position: st.lastPosition,
      playing: false,
    });
  },

  async removeTrack(id) {
    await db.deleteTrack(id);
    if (get().currentTrackId === id) get().closeTrack();
    set({ library: await db.listTracks() });
  },

  closeTrack() {
    engine?.pause();
    set({ currentTrackId: null, playing: false, peaks: null, position: 0 });
  },

  togglePlay() {
    if (!get().currentTrackId) return;
    const e = ensureEngine();
    if (get().playing) {
      e.pause();
      set({ playing: false });
    } else {
      e.play();
      set({ playing: true });
    }
    persist();
  },

  seek(t) {
    engine?.seek(t);
    set({ position: t });
    persist();
  },

  setTempo(t) {
    const v = clampTempo(t);
    engine?.setTempo(v);
    set({ tempo: v });
    persist();
  },

  setPitch(n) {
    const v = clampSemitones(n);
    engine?.setPitchSemitones(v);
    set({ pitch: v });
    persist();
  },

  setLoopA() {
    set({ loopStart: get().position });
    const { loopStart, loopEnd } = get();
    engine?.setLoop(loopStart, loopEnd);
    persist();
  },

  setLoopB() {
    set({ loopEnd: get().position });
    const { loopStart, loopEnd } = get();
    engine?.setLoop(loopStart, loopEnd);
    persist();
  },

  clearLoop() {
    set({ loopStart: null, loopEnd: null });
    engine?.setLoop(null, null);
    persist();
  },

  setPxPerSec(v) {
    set({ pxPerSec: clampPxPerSec(v) });
    persist();
  },

  tick() {
    if (!engine) return;
    set({ position: engine.getCurrentTime(), playing: engine.playing });
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/usePlayerStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: player store with import/open/loop/persist"
```

---

## Task 9: WaveformCanvas (moving viewport + gestures)

**Files:**
- Create: `src/waveform/WaveformCanvas.tsx`

**Interfaces:**
- Consumes: viewport math (Task 4), store (Task 8).
- Produces: `<WaveformCanvas />` — reads store for peaks/position/pxPerSec/loop, renders in rAF, handles 1-finger pan→seek and 2-finger pinch→zoom.

> Canvas rendering + touch is verified by build + manual device check (Step 3). The math it depends on is unit-tested in Task 4.

- [ ] **Step 1: Write `src/waveform/WaveformCanvas.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { timeToX, xToTime, clampPxPerSec } from './viewport';
import { PEAKS_RESOLUTION as RES } from './computePeaks';

export function WaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = usePlayerStore;

  // rAF render loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext('2d')!;
    let raf = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cssW, cssH);

      const s = store.getState();
      if (s.playing) s.tick();
      const { peaks, position, pxPerSec, loopStart, loopEnd, duration } = store.getState();

      // loop region
      if (loopStart !== null && loopEnd !== null) {
        const xa = timeToX(loopStart, position, pxPerSec, cssW);
        const xb = timeToX(loopEnd, position, pxPerSec, cssW);
        g.fillStyle = 'rgba(90,160,255,0.18)';
        g.fillRect(xa, 0, xb - xa, cssH);
      }

      // waveform peaks within visible window
      if (peaks) {
        const mid = cssH / 2;
        const secondsPerBucket = 1 / RES;
        const leftTime = xToTime(0, position, pxPerSec, cssW);
        const rightTime = xToTime(cssW, position, pxPerSec, cssW);
        const firstBucket = Math.max(0, Math.floor(leftTime / secondsPerBucket));
        const lastBucket = Math.min(peaks.length / 2 - 1, Math.ceil(rightTime / secondsPerBucket));
        g.strokeStyle = '#5aa0ff';
        g.beginPath();
        for (let b = firstBucket; b <= lastBucket; b++) {
          const t = b * secondsPerBucket;
          const x = timeToX(t, position, pxPerSec, cssW);
          const min = peaks[b * 2];
          const max = peaks[b * 2 + 1];
          g.moveTo(x, mid - max * mid);
          g.lineTo(x, mid - min * mid);
        }
        g.stroke();
      }

      // fixed center playhead
      g.strokeStyle = '#ff5a5a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cssW / 2, 0);
      g.lineTo(cssW / 2, cssH);
      g.stroke();

      void duration;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [store]);

  // gestures
  useEffect(() => {
    const canvas = canvasRef.current!;
    let mode: 'none' | 'pan' | 'pinch' = 'none';
    let lastX = 0;
    let pinchStartDist = 0;
    let pinchStartPx = 100;
    let wasPlaying = false;

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      const s = store.getState();
      if (e.touches.length === 1) {
        mode = 'pan';
        lastX = e.touches[0].clientX;
        wasPlaying = s.playing;
        if (wasPlaying) s.togglePlay();
      } else if (e.touches.length === 2) {
        mode = 'pinch';
        pinchStartDist = dist(e.touches);
        pinchStartPx = s.pxPerSec;
      }
    };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const s = store.getState();
      if (mode === 'pan' && e.touches.length === 1) {
        const x = e.touches[0].clientX;
        const dt = -(x - lastX) / s.pxPerSec;
        lastX = x;
        s.seek(Math.max(0, Math.min(s.position + dt, s.duration)));
      } else if (mode === 'pinch' && e.touches.length === 2) {
        const factor = dist(e.touches) / pinchStartDist;
        s.setPxPerSec(clampPxPerSec(pinchStartPx * factor));
      }
    };
    const onEnd = () => {
      if (mode === 'pan' && wasPlaying) store.getState().togglePlay();
      mode = 'none';
      wasPlaying = false;
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
    };
  }, [store]);

  return <canvas ref={canvasRef} className="waveform" style={{ touchAction: 'none' }} />;
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: no errors (after fixing the import noted above).

- [ ] **Step 3: Manual verify (after Player screen exists, Task 12)**

Deferred visual check: waveform scrolls left during playback with playhead fixed
at center; 1-finger drag scrubs; 2-finger pinch zooms; loop region shaded.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: moving waveform canvas with pan and pinch"
```

---

## Task 10: Transport + Tempo + Pitch + Loop controls

**Files:**
- Create: `src/ui/TransportBar.tsx`, `src/ui/TempoControl.tsx`, `src/ui/PitchControl.tsx`, `src/ui/LoopControls.tsx`, `src/ui/controls.test.tsx`, `src/ui/styles.css`

**Interfaces:**
- Consumes: store (Task 8).
- Produces: four control components used by Player (Task 12).

- [ ] **Step 1: Write failing test `src/ui/controls.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { TempoControl } from './TempoControl';
import { PitchControl } from './PitchControl';

describe('controls', () => {
  beforeEach(() => {
    usePlayerStore.setState({ tempo: 1, pitch: 0, currentTrackId: 't' });
  });

  it('tempo slider updates store', () => {
    render(<TempoControl />);
    const slider = screen.getByLabelText(/темп/i) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(usePlayerStore.getState().tempo).toBe(0.5);
  });

  it('pitch + button raises semitone', () => {
    render(<PitchControl />);
    fireEvent.click(screen.getByLabelText(/выше/i));
    expect(usePlayerStore.getState().pitch).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/controls.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write `src/ui/TempoControl.tsx`**

```tsx
import { usePlayerStore } from '../store/usePlayerStore';
import { TEMPO_MIN, TEMPO_MAX } from '../engine/params';

export function TempoControl() {
  const tempo = usePlayerStore((s) => s.tempo);
  const setTempo = usePlayerStore((s) => s.setTempo);
  return (
    <div className="control">
      <div className="control-row">
        <span>Темп</span>
        <span>{tempo.toFixed(2)}×</span>
        <button className="reset" onClick={() => setTempo(1)}>сброс</button>
      </div>
      <input
        aria-label="темп"
        type="range"
        min={TEMPO_MIN}
        max={TEMPO_MAX}
        step={0.05}
        value={tempo}
        onChange={(e) => setTempo(parseFloat(e.target.value))}
      />
    </div>
  );
}
```

- [ ] **Step 4: Write `src/ui/PitchControl.tsx`**

```tsx
import { usePlayerStore } from '../store/usePlayerStore';

export function PitchControl() {
  const pitch = usePlayerStore((s) => s.pitch);
  const setPitch = usePlayerStore((s) => s.setPitch);
  return (
    <div className="control">
      <div className="control-row">
        <span>Тон</span>
        <span>{pitch > 0 ? `+${pitch}` : pitch}</span>
        <button className="reset" onClick={() => setPitch(0)}>сброс</button>
      </div>
      <div className="stepper">
        <button aria-label="ниже" onClick={() => setPitch(pitch - 1)}>−</button>
        <button aria-label="выше" onClick={() => setPitch(pitch + 1)}>＋</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `src/ui/LoopControls.tsx`**

```tsx
import { usePlayerStore } from '../store/usePlayerStore';

export function LoopControls() {
  const { loopStart, loopEnd, setLoopA, setLoopB, clearLoop } = usePlayerStore((s) => ({
    loopStart: s.loopStart,
    loopEnd: s.loopEnd,
    setLoopA: s.setLoopA,
    setLoopB: s.setLoopB,
    clearLoop: s.clearLoop,
  }));
  const active = loopStart !== null && loopEnd !== null;
  return (
    <div className="control loop">
      <button onClick={setLoopA}>A{loopStart !== null ? ` ${loopStart.toFixed(1)}` : ''}</button>
      <button onClick={setLoopB}>B{loopEnd !== null ? ` ${loopEnd.toFixed(1)}` : ''}</button>
      <button onClick={clearLoop} disabled={!active}>сброс</button>
    </div>
  );
}
```

- [ ] **Step 6: Write `src/ui/TransportBar.tsx`**

```tsx
import { usePlayerStore } from '../store/usePlayerStore';

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TransportBar() {
  const { playing, position, duration, togglePlay, seek } = usePlayerStore((s) => ({
    playing: s.playing,
    position: s.position,
    duration: s.duration,
    togglePlay: s.togglePlay,
    seek: s.seek,
  }));
  return (
    <div className="transport">
      <button aria-label="назад 5с" onClick={() => seek(Math.max(0, position - 5))}>−5</button>
      <button aria-label={playing ? 'пауза' : 'играть'} className="play" onClick={togglePlay}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button aria-label="вперёд 5с" onClick={() => seek(Math.min(duration, position + 5))}>+5</button>
      <span className="time">{fmt(position)} / {fmt(duration)}</span>
    </div>
  );
}
```

- [ ] **Step 7: Write `src/ui/styles.css`** (touch sizing)

```css
:root { --touch: 48px; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #12141a; color: #eee; }
button { min-width: var(--touch); min-height: var(--touch); font-size: 18px;
  border: none; border-radius: 12px; background: #2a2e3a; color: #eee; }
button:active { background: #3a4050; }
.waveform { display: block; width: 100%; height: 50vh; background: #0c0e12; }
.transport { position: sticky; bottom: 0; display: flex; gap: 12px; align-items: center;
  padding: 12px; background: #181b22; }
.transport .play { min-width: 72px; min-height: 72px; font-size: 24px; border-radius: 50%; }
.transport .time { margin-left: auto; font-variant-numeric: tabular-nums; }
.control { padding: 12px; }
.control-row { display: flex; gap: 12px; align-items: center; }
.control input[type="range"] { width: 100%; height: var(--touch); }
.stepper, .loop { display: flex; gap: 12px; }
.stepper button { flex: 1; font-size: 28px; }
.reset { min-width: auto; padding: 8px 12px; font-size: 14px; background: transparent; }
.library-item { display: flex; align-items: center; min-height: 64px; padding: 0 16px;
  border-bottom: 1px solid #23262f; }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/ui/controls.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: transport and tempo/pitch/loop controls"
```

---

## Task 11: Library screen (import / open / delete)

**Files:**
- Create: `src/screens/Library.tsx`, `src/screens/Library.test.tsx`

**Interfaces:**
- Consumes: store (Task 8).
- Produces: `<Library />` — import button (file input), track list, open on tap, delete on long-press/button.

- [ ] **Step 1: Write failing test `src/screens/Library.test.tsx`**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { Library } from './Library';
import type { TrackRecord } from '../types';

const t: TrackRecord = {
  id: 'a', name: 'Соната', blob: new Blob(), peaks: new Float32Array(),
  duration: 61, createdAt: 1,
};

describe('Library', () => {
  beforeEach(() => {
    usePlayerStore.setState({ library: [t] });
  });

  it('renders track names', () => {
    render(<Library />);
    expect(screen.getByText('Соната')).toBeInTheDocument();
  });

  it('opens track on click', () => {
    const openTrack = vi.fn();
    usePlayerStore.setState({ openTrack });
    render(<Library />);
    screen.getByText('Соната').click();
    expect(openTrack).toHaveBeenCalledWith('a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/Library.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write `src/screens/Library.tsx`**

```tsx
import { useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Library() {
  const library = usePlayerStore((s) => s.library);
  const importFile = usePlayerStore((s) => s.importFile);
  const openTrack = usePlayerStore((s) => s.openTrack);
  const removeTrack = usePlayerStore((s) => s.removeTrack);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="library">
      <header className="control-row" style={{ padding: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Разбор</h1>
        <button style={{ marginLeft: 'auto' }} onClick={() => fileRef.current?.click()}>
          ＋ Импорт
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = '';
          }}
        />
      </header>
      {library.length === 0 && (
        <p style={{ padding: 16, opacity: 0.6 }}>Нет треков. Импортируй аудио с телефона.</p>
      )}
      {library.map((t) => (
        <div key={t.id} className="library-item">
          <span onClick={() => openTrack(t.id)} style={{ flex: 1 }}>{t.name}</span>
          <span style={{ opacity: 0.6, marginRight: 12 }}>{fmt(t.duration)}</span>
          <button
            aria-label="удалить"
            onClick={() => {
              if (confirm(`Удалить «${t.name}»?`)) void removeTrack(t.id);
            }}
          >
            🗑
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/Library.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: library screen import/open/delete"
```

---

## Task 12: Player screen + App routing (remove dev harness)

**Files:**
- Create: `src/screens/Player.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`

**Interfaces:**
- Consumes: store (Task 8), WaveformCanvas (Task 9), controls (Task 10), Library (Task 11).
- Produces: full assembled app; `App` shows Library when `currentTrackId===null`, else Player.

- [ ] **Step 1: Write `src/screens/Player.tsx`**

```tsx
import { usePlayerStore } from '../store/usePlayerStore';
import { WaveformCanvas } from '../waveform/WaveformCanvas';
import { TransportBar } from '../ui/TransportBar';
import { TempoControl } from '../ui/TempoControl';
import { PitchControl } from '../ui/PitchControl';
import { LoopControls } from '../ui/LoopControls';

export function Player() {
  const closeTrack = usePlayerStore((s) => s.closeTrack);
  return (
    <div className="player">
      <header className="control-row" style={{ padding: 12 }}>
        <button aria-label="назад" onClick={closeTrack}>‹ Библиотека</button>
      </header>
      <WaveformCanvas />
      <TempoControl />
      <PitchControl />
      <LoopControls />
      <TransportBar />
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `src/App.tsx`**

```tsx
import { useEffect } from 'react';
import { usePlayerStore } from './store/usePlayerStore';
import { Library } from './screens/Library';
import { Player } from './screens/Player';
import './ui/styles.css';

export default function App() {
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const init = usePlayerStore((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);
  return currentTrackId ? <Player /> : <Library />;
}
```

- [ ] **Step 3: Build + full test run**

Run: `npx tsc --noEmit && npm test`
Expected: type-clean, all unit/component tests pass.

- [ ] **Step 4: Manual verify full flow on a phone**

Run: `npm run dev` (use `--host` to open on the phone over LAN).
Checklist:
- Import an audio file → appears in library.
- Open it → waveform renders, playhead centered.
- Play → waveform scrolls left, audio plays.
- Tempo 0.5 → half speed, pitch intact; waveform scroll matches.
- Pitch −3 → lower tone.
- Drag waveform → scrubs; pinch → zoom; loop A/B → repeats.
- Back to library, reopen → tempo/pitch/loop/position restored.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: assemble player screen and app routing"
```

---

## Task 13: PWA (offline shell + manifest) + wake lock

**Files:**
- Modify: `vite.config.ts`, `src/App.tsx`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `src/pwa/wakeLock.ts`

**Interfaces:**
- Produces: installable, offline-capable app; screen stays awake during playback.

- [ ] **Step 1: Add `VitePWA` to `vite.config.ts`**

```ts
import { VitePWA } from 'vite-plugin-pwa';
// inside plugins: [...]
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Разбор',
    short_name: 'Разбор',
    lang: 'ru',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#12141a',
    theme_color: '#12141a',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'] },
}),
```

- [ ] **Step 2: Add placeholder icons**

Create `public/icons/icon-192.png` and `icon-512.png` (any solid-color PNG for now).

```bash
# if imagemagick present:
convert -size 192x192 xc:'#5aa0ff' public/icons/icon-192.png
convert -size 512x512 xc:'#5aa0ff' public/icons/icon-512.png
```

- [ ] **Step 3: Write `src/pwa/wakeLock.ts`**

```ts
let lock: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator && !lock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    }
  } catch {
    /* wake lock not available */
  }
}

export function releaseWakeLock(): void {
  void lock?.release();
  lock = null;
}
```

- [ ] **Step 4: Drive wake lock from playing state in `App.tsx`**

Add an effect:

```tsx
import { requestWakeLock, releaseWakeLock } from './pwa/wakeLock';
// ...
const playing = usePlayerStore((s) => s.playing);
useEffect(() => {
  if (playing) void requestWakeLock();
  else releaseWakeLock();
}, [playing]);
```

- [ ] **Step 5: Build + preview**

Run: `npm run build && npm run preview`
Expected: build succeeds; opening preview shows an installable app (Add to Home
Screen). After first load, disable network → app shell still loads; imported
tracks (IndexedDB) still open and play.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: PWA offline shell, manifest, screen wake lock"
```

---

## Task 14: CLAUDE.md for the repo

**Files:**
- Create: `CLAUDE.md`

**Interfaces:**
- Produces: repo guide referencing the real structure now that it exists.

- [ ] **Step 1: Write `CLAUDE.md`**

Cover: prefix required by `/init`; commands (`npm run dev/build/test`, single test
via `npx vitest run <path>`); architecture (5 layers, engine behind `AudioEngine`,
pure-math modules are the TDD surface, imperative engine/canvas verified manually);
the SoundTouch tempo rule (set `playbackRate` on BOTH source and node); position is
computed, not reported by the worklet; waveform is a moving centered viewport.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: CLAUDE.md project guide"
```

---

## Self-Review

**Spec coverage:**
- Локальные файлы → Task 11 import (`accept="audio/*"`). ✓
- Замедление без изменения тона → Task 7 (SoundTouch tempo via playbackRate). ✓
- A-B луп → Task 7 native loop + Task 8 setLoopA/B + Task 10 UI. ✓
- Транспонирование → Task 7 `pitchSemitones` + Task 8/10. ✓
- Движущийся waveform (центр-playhead, окно, пан, зум) → Task 4 + Task 9. ✓
- Сохранение (треки+настройки+маркеры-схема) → Task 6 + Task 8 persist. ✓
- Офлайн PWA → Task 13. ✓
- Тач ≥44px → Task 10 styles.css (`--touch:48px`). ✓
- Движок за интерфейсом → Task 7 `AudioEngine`. ✓
- Маркеры/мини-карта вне MVP → поля есть (Task 6 `markers`), UI нет. ✓

**Placeholder scan:** Icon PNGs in Task 13 are explicit throwaway solids
(replaced with real icons later). No logic placeholders.

**Type consistency:** `AudioEngine` methods (`getCurrentTime`, `getDuration`,
`setPitchSemitones`, `setLoop`) match across Tasks 7/8. Store action names match
between Task 8 interface and Tasks 9–12 consumers (`togglePlay`, `seek`,
`setTempo`, `setPitch`, `setLoopA/B`, `clearLoop`, `setPxPerSec`, `tick`).
`TrackStateRecord.pxPerSec` consistent Task 6/8. `PEAKS_RESOLUTION` lives in
computePeaks and is imported as `RES` in Task 9.

**Known follow-ups (not MVP):** markers UI, mini-map, Rubberband engine.
