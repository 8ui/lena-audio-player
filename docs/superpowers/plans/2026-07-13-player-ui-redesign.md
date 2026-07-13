# Player UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переработать экран плеера по спеке `docs/superpowers/specs/2026-07-13-player-ui-redesign-design.md`: тёплая тема на токенах, док (степпер темпа / play по центру / чипы-табы с поповером-оверлеем), плашка времени над волной, перекрашенные канвасы.

**Architecture:** Цвета сводятся в один источник — `src/ui/theme.ts` (две палитры, `warm` по умолчанию). DOM берёт их из CSS-переменных в `:root[data-theme=…]`, канвасы — импортом из `theme.ts`; парность двух файлов проверяется юнит-тестом. Экран плеера пересобирается из мелких компонентов: `PlayerHeader`, `WaveformCanvas` + `TimeBadge` (оверлей), `MiniMap`, `PlayerDock` (`TempoStepper`, `TransportBar`, `ControlTabs`). Стор, движок, жесты и схема БД не меняются; канвасы правятся только в цветах.

**Tech Stack:** React 19, TypeScript 7 (tsgo), Vite 8, Zustand 5, Vitest 4 + Testing Library, обычный CSS (никаких новых зависимостей).

## Global Constraints

- **Никаких новых зависимостей.** Ни CSS-фреймворков, ни UI-китов.
- **Стор, движок, IndexedDB, жесты — не трогаем.** `usePlayerStore.ts`, `SoundTouchEngine.ts`, `AudioEngine.ts`, `db.ts`, `minimapGesture.ts`, `viewport.ts`, `computePeaks.ts`, `markers.ts` остаются как есть.
- **Канвасы** (`WaveformCanvas.tsx`, `MiniMap.tsx`) правятся **только в цветовых константах**. Ни строчки логики рисования, гейтов dirty-check, размеров backing store или обработчиков касаний. По CLAUDE.md все исторические HIGH-баги жили именно там.
- **Экран библиотеки вне скоупа**, но не должен развалиться: классы `.library`, `.library-item`, `.screen-header`, `.control-row` остаются в CSS.
- **Тема по умолчанию `warm`.** UI-переключателя нет; `studio` проверяется через `localStorage`.
- Тип-чек не входит в сборку: после правок гоняем `npx tsc --noEmit` отдельно (esbuild типы не проверяет).
- `vite.config.ts` вне гейта `tsc` — после его правки обязателен реальный `npm run build`.
- Тесты запускаются `npx vitest run <path>`; весь прогон — `npm test`.
- Язык интерфейса — русский, как сейчас.

---

## File Structure

**Создаются:**
- `src/ui/theme.ts` — палитры, токены, `applyTheme`/`activePalette`.
- `src/ui/theme.test.ts` — парность `theme.ts` ↔ `styles.css`.
- `src/ui/time.ts` — `fmtTime` (сейчас скопирована в двух файлах).
- `src/ui/PlayerHeader.tsx`, `src/ui/TimeBadge.tsx`, `src/ui/TempoStepper.tsx`,
  `src/ui/ControlTabs.tsx`, `src/ui/PitchPanel.tsx`, `src/ui/LoopPanel.tsx`,
  `src/ui/MarkersPanel.tsx`, `src/ui/PlayerDock.tsx`.
- `src/ui/TempoStepper.test.tsx`, `src/ui/ControlTabs.test.tsx`, `src/ui/panels.test.tsx`.

**Правятся:**
- `src/ui/styles.css` — переписывается на токенах.
- `src/ui/TransportBar.tsx` — остаётся только play.
- `src/screens/Player.tsx` — новая композиция.
- `src/screens/Library.tsx` — только импорт `fmtTime` вместо локальной копии.
- `src/engine/params.ts` (+ `params.test.ts`) — `TEMPO_STEP`, `stepTempo`.
- `src/waveform/WaveformCanvas.tsx`, `src/waveform/MiniMap.tsx` — только цвета.
- `src/main.tsx` — вызов `applyTheme()` до рендера.
- `index.html`, `vite.config.ts` — `theme-color` / цвета манифеста под тёплую тему.
- `src/ui/controls.test.tsx` — переписывается под новые компоненты.

**Удаляются:** `src/ui/TempoControl.tsx`, `src/ui/PitchControl.tsx`, `src/ui/LoopControls.tsx`, `src/ui/MarkersControl.tsx`, `src/ui/MarkersControl.test.tsx`.

---

### Task 1: Тема и токены

**Files:**
- Create: `src/ui/theme.ts`
- Test: `src/ui/theme.test.ts`
- Modify: `src/ui/styles.css` (полная перезапись), `src/main.tsx`, `index.html:6`, `vite.config.ts:38-39`

**Interfaces:**
- Consumes: ничего.
- Produces: `type ThemeName = 'warm' | 'studio'`; `interface Palette` с ключами `bg, surface, elevated, border, text, muted, accent, onAccent, playhead, loopFill, marker, canvasBg, minimapPeaks` (все `string`); `THEMES: Record<ThemeName, Palette>`; `DEFAULT_THEME: ThemeName`; `loadThemeName(): ThemeName`; `applyTheme(name?: ThemeName): void`; `activePalette(): Palette`. CSS-переменные: имя ключа палитры в kebab-case (`loopFill` → `--loop-fill`).

> Замечание к спеке: добавлен токен `onAccent` (цвет текста на акцентной кнопке play) — в спеке его не было, а без него play-кнопку не покрасить.

- [ ] **Step 1: Написать падающий тест парности токенов**

Create `src/ui/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEMES, loadThemeName, applyTheme, activePalette, type ThemeName, type Palette } from './theme';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

const kebab = (k: string): string => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function cssVars(theme: ThemeName): Record<string, string> {
  const block = new RegExp(`:root\\[data-theme=['"]${theme}['"]\\]\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`styles.css has no :root[data-theme="${theme}"] block`);
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

describe('theme', () => {
  // The canvases take their colours from theme.ts and the DOM takes them from
  // styles.css. Nothing but this test stops the two from drifting apart, and
  // drift is invisible until you look at a real device.
  it.each(['warm', 'studio'] as ThemeName[])('%s: every palette key matches its CSS variable', (name) => {
    const vars = cssVars(name);
    const palette = THEMES[name];
    for (const key of Object.keys(palette) as (keyof Palette)[]) {
      expect(vars[kebab(key)], `--${kebab(key)}`).toBe(palette[key]);
    }
  });

  it('falls back to warm on an unknown stored value', () => {
    localStorage.setItem('razbor.theme', 'nonsense');
    expect(loadThemeName()).toBe('warm');
    localStorage.removeItem('razbor.theme');
  });

  it('reads the stored theme', () => {
    localStorage.setItem('razbor.theme', 'studio');
    expect(loadThemeName()).toBe('studio');
    localStorage.removeItem('razbor.theme');
  });

  it('applyTheme sets data-theme and activePalette follows it', () => {
    applyTheme('studio');
    expect(document.documentElement.dataset.theme).toBe('studio');
    expect(activePalette()).toBe(THEMES.studio);

    applyTheme('warm');
    expect(activePalette()).toBe(THEMES.warm);
  });

  it('activePalette defaults to warm when no theme is applied', () => {
    delete document.documentElement.dataset.theme;
    expect(activePalette()).toBe(THEMES.warm);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/ui/theme.test.ts`
Expected: FAIL — `Cannot find module './theme'`.

- [ ] **Step 3: Написать `src/ui/theme.ts`**

```ts
// Single source of truth for colour. The DOM reads these values as CSS
// variables (styles.css), the canvases import them directly — theme.test.ts
// pins the two files to the same numbers.
export type ThemeName = 'warm' | 'studio';

export interface Palette {
  bg: string;
  surface: string;
  elevated: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  playhead: string;
  loopFill: string;
  marker: string;
  canvasBg: string;
  minimapPeaks: string;
}

// Canvas colours carry meaning: accent = the data (waveform peaks),
// playhead = "now", marker = a marker. Keep those roles when adding a theme.
export const THEMES: Record<ThemeName, Palette> = {
  warm: {
    bg: '#17150f',
    surface: '#1e1b14',
    elevated: '#241f18',
    border: '#2b2720',
    text: '#f2ece0',
    muted: '#a09582',
    accent: '#ffb43f',
    onAccent: '#231a08',
    playhead: '#ff5a5a',
    loopFill: 'rgba(255,180,63,0.14)',
    marker: '#8be0ff',
    canvasBg: '#100f0b',
    minimapPeaks: '#8a6a30',
  },
  studio: {
    bg: '#12141a',
    surface: '#181b22',
    elevated: '#2a2e3a',
    border: '#23262f',
    text: '#eeeeee',
    muted: '#8b93a7',
    accent: '#5aa0ff',
    onAccent: '#08111f',
    playhead: '#ff5a5a',
    loopFill: 'rgba(90,160,255,0.18)',
    marker: '#ffcf5a',
    canvasBg: '#0c0e12',
    minimapPeaks: '#3f6ea8',
  },
};

export const DEFAULT_THEME: ThemeName = 'warm';

const STORAGE_KEY = 'razbor.theme';

export function loadThemeName(): ThemeName {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'warm' || v === 'studio' ? v : DEFAULT_THEME;
  } catch {
    // Safari private mode can throw on localStorage access.
    return DEFAULT_THEME;
  }
}

export function applyTheme(name: ThemeName = loadThemeName()): void {
  document.documentElement.dataset.theme = name;
}

// Called by both canvases once per drawn frame: a single dataset read, and it
// means a theme change needs no subscription — the canvases already redraw.
export function activePalette(): Palette {
  return THEMES[document.documentElement.dataset.theme === 'studio' ? 'studio' : 'warm'];
}
```

- [ ] **Step 4: Переписать `src/ui/styles.css`**

Полное содержимое файла:

```css
:root {
  --touch: 48px;
  --r-lg: 20px;
  --r-md: 14px;
  --r-sm: 10px;
}

/* Values here are mirrored in src/ui/theme.ts — theme.test.ts fails if they
   drift. Add a token in BOTH files or not at all. */
:root[data-theme='warm'] {
  --bg: #17150f;
  --surface: #1e1b14;
  --elevated: #241f18;
  --border: #2b2720;
  --text: #f2ece0;
  --muted: #a09582;
  --accent: #ffb43f;
  --on-accent: #231a08;
  --playhead: #ff5a5a;
  --loop-fill: rgba(255,180,63,0.14);
  --marker: #8be0ff;
  --canvas-bg: #100f0b;
  --minimap-peaks: #8a6a30;
}

:root[data-theme='studio'] {
  --bg: #12141a;
  --surface: #181b22;
  --elevated: #2a2e3a;
  --border: #23262f;
  --text: #eeeeee;
  --muted: #8b93a7;
  --accent: #5aa0ff;
  --on-accent: #08111f;
  --playhead: #ff5a5a;
  --loop-fill: rgba(90,160,255,0.18);
  --marker: #ffcf5a;
  --canvas-bg: #0c0e12;
  --minimap-peaks: #3f6ea8;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  /* Touch-only app: a long-press must never raise iOS's copy/share callout,
     nothing here is text to select, and taps must not flash grey (buttons
     already give feedback via button:active below). These are inherited, so
     body is the right place — the canvases need no rule of their own. */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

/* Inherited `user-select: none` has historically broken the caret/selection
   inside form controls on iOS Safari. Nothing needs it today, but marker-label
   editing is the obvious next feature. */
input, textarea { -webkit-user-select: auto; user-select: auto; }

button {
  min-width: var(--touch);
  min-height: var(--touch);
  font-family: inherit;
  font-size: 18px;
  border: none;
  border-radius: var(--r-md);
  background: var(--elevated);
  color: var(--text);
}
button:active { filter: brightness(1.3); }
button:disabled { opacity: 0.4; }

/* ── Player screen ───────────────────────────────────────────────────────
   A full-height flex column: the waveform is flex:1 and eats whatever the
   dock leaves. dvh, not vh — iOS's collapsing URL bar makes vh too tall. */
.player {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

.player-header {
  display: flex;
  align-items: center;
  gap: 12px;
  /* Standalone on iOS runs full-bleed (viewport-fit=cover), so the top bar can
     land under the status bar / notch. env() is 0 where there is no inset. */
  padding: calc(6px + env(safe-area-inset-top)) 10px 6px;
  font-size: 13px;
  color: var(--muted);
}
.player-header .back {
  min-width: auto;
  min-height: 40px;
  padding: 0 10px;
  font-size: 14px;
  background: transparent;
  color: var(--muted);
}
.player-header .track-name {
  margin-left: auto;
  max-width: 60%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.wave-wrap {
  position: relative;
  flex: 1;
  /* Without min-height:0 a flex item refuses to shrink below its content and
     the dock gets pushed off-screen on short viewports. */
  min-height: 0;
}
.waveform {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--canvas-bg);
}

.time-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
  opacity: 0.9;
  /* The badge sits ON the waveform: a pan gesture starting under it must reach
     the canvas, so it can never be a touch target. */
  pointer-events: none;
}
.time-badge .total { opacity: 0.6; }

.minimap {
  display: block;
  width: 100%;
  height: 48px;
  background: var(--canvas-bg);
  border-top: 1px solid var(--border);
}

/* ── Dock ── */
.dock {
  /* Anchor for the popover, which is an overlay: opening a panel must not
     resize the waveform. */
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  /* Standalone on iOS runs full-bleed, so the dock would sit under the home
     indicator without the bottom inset. */
  padding: 10px 10px calc(10px + env(safe-area-inset-bottom));
}

.tempo { display: flex; gap: 8px; }
.tempo button {
  flex: 0 0 auto;
  width: 64px;
  height: 58px;
  font-size: 26px;
  border-radius: var(--r-lg);
}
.tempo .value {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 58px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}
.tempo .value b {
  font-size: 26px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
}
.tempo .value small {
  font-size: 9px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--muted);
}

.transport { display: flex; justify-content: center; }
.transport .play {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 24px;
}

.chips { display: flex; gap: 8px; }
.chips button {
  flex: 1;
  min-width: 0;
  height: 44px;
  font-size: 13px;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}
/* State lives on the chip itself: a set loop / non-zero pitch / any marker is
   visible without opening the panel. */
.chips button.on { color: var(--accent); border-color: var(--accent); }
.chips button[aria-selected='true'] { color: var(--text); border-color: var(--accent); }

/* The popover floats ABOVE the dock (over the waveform), never inside the flex
   column — that is what keeps the layout from jumping when a tab opens. All
   three panels are one row of equal-height buttons, so switching tabs does not
   resize it either. */
.popover {
  position: absolute;
  right: 8px;
  bottom: calc(100% + 8px);
  left: 8px;
  z-index: 20;
  display: flex;
  gap: 8px;
  padding: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.popover button {
  flex: 1;
  min-width: 0;
  height: 52px;
  font-size: 15px;
  border-radius: var(--r-md);
}
.popover button.primary { flex: 2; color: var(--accent); }
.popover button.val {
  flex: 2;
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

/* Catches a tap outside the popover. Deliberately covers the canvases: with a
   panel open, a tap should close it, not scrub the waveform. */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
}

/* ── Library (out of scope for this redesign — keep it working) ── */
.screen-header { padding: calc(12px + env(safe-area-inset-top)) 16px 12px; }
.control-row { display: flex; gap: 12px; align-items: center; }
.library-item {
  display: flex;
  align-items: center;
  min-height: 64px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
}
```

- [ ] **Step 5: Ставить тему до рендера**

Modify `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme } from './ui/theme';

// Before the first paint: every CSS variable lives under :root[data-theme=…],
// so without this the app renders with no colours at all.
applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Прогнать тест — должен пройти**

Run: `npx vitest run src/ui/theme.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 7: Перекрасить `theme-color` и манифест**

`index.html:6` — заменить `content="#12141a"` на `content="#17150f"`.

`vite.config.ts:38-39`:

```ts
        background_color: '#17150f',
        theme_color: '#17150f',
```

- [ ] **Step 8: Реальная сборка (vite.config.ts вне гейта tsc)**

Run: `npm run build`
Expected: сборка проходит; затем `grep -o '"theme_color":"[^"]*"' dist/manifest.webmanifest` → `"theme_color":"#17150f"`.

- [ ] **Step 9: Коммит**

```bash
git add src/ui/theme.ts src/ui/theme.test.ts src/ui/styles.css src/main.tsx index.html vite.config.ts
git commit -m "feat(ui): design tokens and two themes behind a single theme.ts"
```

---

### Task 2: `stepTempo` — шаг темпа 0.1

**Files:**
- Modify: `src/engine/params.ts`, `src/engine/params.test.ts`

**Interfaces:**
- Consumes: `clampTempo`, `TEMPO_MIN = 0.25`, `TEMPO_MAX = 1.5`, `TEMPO_DEFAULT = 1` (уже есть в `params.ts`).
- Produces: `TEMPO_STEP = 0.1`; `stepTempo(t: number, dir: 1 | -1): number` — прибавляет/отнимает шаг, округляет до 2 знаков, клампит.

- [ ] **Step 1: Написать падающие тесты**

Дописать в конец `src/engine/params.test.ts` (файл уже есть, дополняем, не перезаписываем):

```ts
import { TEMPO_STEP, stepTempo } from './params';

describe('stepTempo', () => {
  it('steps up and down by TEMPO_STEP', () => {
    expect(TEMPO_STEP).toBe(0.1);
    expect(stepTempo(1, -1)).toBe(0.9);
    expect(stepTempo(0.9, 1)).toBe(1);
  });

  // 0.75 - 0.1 === 0.6499999999999999 in IEEE-754. Without rounding the UI
  // would show 0.65× once and 0.64× after a round-trip through the store.
  it('rounds away float noise', () => {
    expect(stepTempo(0.75, -1)).toBe(0.65);
    expect(stepTempo(0.35, -1)).toBe(0.25);
  });

  it('clamps at both ends and is idempotent there', () => {
    expect(stepTempo(1.5, 1)).toBe(1.5);
    expect(stepTempo(1.45, 1)).toBe(1.5);
    expect(stepTempo(0.25, -1)).toBe(0.25);
    expect(stepTempo(0.3, -1)).toBe(0.25);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run src/engine/params.test.ts`
Expected: FAIL — `stepTempo is not a function` / нет экспорта.

- [ ] **Step 3: Реализовать**

Дописать в `src/engine/params.ts`:

```ts
export const TEMPO_STEP = 0.1;

// Rounding is not cosmetic: 0.75 - 0.1 is 0.6499999999999999, and that value
// goes straight into the store, the engine and IndexedDB.
export const stepTempo = (t: number, dir: 1 | -1): number =>
  clampTempo(Math.round((t + dir * TEMPO_STEP) * 100) / 100);
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run src/engine/params.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/engine/params.ts src/engine/params.test.ts
git commit -m "feat(engine): stepTempo — 0.1 steps with float-noise rounding"
```

---

### Task 3: `fmtTime` — одна реализация форматирования времени

**Files:**
- Create: `src/ui/time.ts`
- Modify: `src/screens/Library.tsx:34-38` (удалить локальную `fmt`, импортировать `fmtTime`)

**Interfaces:**
- Produces: `fmtTime(t: number): string` — `125` → `"2:05"`.

- [ ] **Step 1: Создать `src/ui/time.ts`**

```ts
// One implementation: TimeBadge, LoopPanel and Library all show m:ss.
export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
```

- [ ] **Step 2: Переключить Library на общую функцию**

В `src/screens/Library.tsx` удалить локальную функцию:

```ts
function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
```

добавить импорт рядом с остальными:

```ts
import { fmtTime } from '../ui/time';
```

и в JSX заменить `{fmt(t.duration)}` на `{fmtTime(t.duration)}`.

- [ ] **Step 3: Проверить, что библиотека не сломалась**

Run: `npx vitest run src/screens/Library.test.tsx`
Expected: PASS.

- [ ] **Step 4: Коммит**

```bash
git add src/ui/time.ts src/screens/Library.tsx
git commit -m "refactor(ui): single fmtTime implementation"
```

---

### Task 4: `TempoStepper` — три кнопки вместо слайдера

**Files:**
- Create: `src/ui/TempoStepper.tsx`, `src/ui/TempoStepper.test.tsx`
- Delete: `src/ui/TempoControl.tsx` (в Task 8, когда `Player.tsx` перестанет его импортировать — здесь только создаём новый)

**Interfaces:**
- Consumes: `stepTempo`, `TEMPO_DEFAULT` из `src/engine/params`; `usePlayerStore` (`tempo`, `setTempo`).
- Produces: `<TempoStepper />` — рендерит `div.tempo` с тремя кнопками: `aria-label="медленнее"`, `aria-label="сбросить темп"` (она же показывает значение), `aria-label="быстрее"`.

- [ ] **Step 1: Написать падающий тест**

Create `src/ui/TempoStepper.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { TempoStepper } from './TempoStepper';

describe('TempoStepper', () => {
  beforeEach(() => {
    usePlayerStore.setState({ tempo: 1, currentTrackId: 't' });
  });
  afterEach(cleanup);

  it('shows the current tempo', () => {
    usePlayerStore.setState({ tempo: 0.75 });
    render(<TempoStepper />);
    expect(screen.getByText('0.75×')).toBeInTheDocument();
  });

  it('steps down by 0.1', () => {
    render(<TempoStepper />);
    fireEvent.click(screen.getByLabelText('медленнее'));
    expect(usePlayerStore.getState().tempo).toBe(0.9);
  });

  it('steps up by 0.1', () => {
    usePlayerStore.setState({ tempo: 0.9 });
    render(<TempoStepper />);
    fireEvent.click(screen.getByLabelText('быстрее'));
    expect(usePlayerStore.getState().tempo).toBe(1);
  });

  it('resets to 1 on a tap on the value', () => {
    usePlayerStore.setState({ tempo: 0.5 });
    render(<TempoStepper />);
    fireEvent.click(screen.getByLabelText('сбросить темп'));
    expect(usePlayerStore.getState().tempo).toBe(1);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/ui/TempoStepper.test.tsx`
Expected: FAIL — `Cannot find module './TempoStepper'`.

- [ ] **Step 3: Реализовать компонент**

Create `src/ui/TempoStepper.tsx`:

```tsx
import { usePlayerStore } from '../store/usePlayerStore';
import { stepTempo, TEMPO_DEFAULT } from '../engine/params';

export function TempoStepper() {
  const tempo = usePlayerStore((s) => s.tempo);
  const setTempo = usePlayerStore((s) => s.setTempo);
  return (
    <div className="tempo">
      <button aria-label="медленнее" onClick={() => setTempo(stepTempo(tempo, -1))}>
        −
      </button>
      <button className="value" aria-label="сбросить темп" onClick={() => setTempo(TEMPO_DEFAULT)}>
        <b>{tempo.toFixed(2)}×</b>
        <small>Темп</small>
      </button>
      <button aria-label="быстрее" onClick={() => setTempo(stepTempo(tempo, 1))}>
        ＋
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Прогнать тест**

Run: `npx vitest run src/ui/TempoStepper.test.tsx`
Expected: PASS (4 теста).

- [ ] **Step 5: Коммит**

```bash
git add src/ui/TempoStepper.tsx src/ui/TempoStepper.test.tsx
git commit -m "feat(ui): TempoStepper replaces the tempo slider"
```

---

### Task 5: Панели (тон / луп / маркеры)

**Files:**
- Create: `src/ui/PitchPanel.tsx`, `src/ui/LoopPanel.tsx`, `src/ui/MarkersPanel.tsx`, `src/ui/panels.test.tsx`
- Delete: `src/ui/PitchControl.tsx`, `src/ui/LoopControls.tsx`, `src/ui/MarkersControl.tsx`, `src/ui/MarkersControl.test.tsx` (в Task 8 — здесь только создаём новые)

**Interfaces:**
- Consumes: `usePlayerStore` (`pitch`/`setPitch`; `loopStart`/`loopEnd`/`setLoopA`/`setLoopB`/`clearLoop`; `markers`/`addMarker`/`removeMarker`/`seekPrevMarker`/`seekNextMarker`), `fmtTime` из `src/ui/time`.
- Produces: `<PitchPanel />`, `<LoopPanel />`, `<MarkersPanel />` — каждая рендерит **фрагмент** (набор `<button>` без обёртки): обёртку `div.popover` даёт `ControlTabs`, поэтому все три панели одной высоты.

- [ ] **Step 1: Написать падающие тесты**

Create `src/ui/panels.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { PitchPanel } from './PitchPanel';
import { LoopPanel } from './LoopPanel';
import { MarkersPanel } from './MarkersPanel';

describe('PitchPanel', () => {
  beforeEach(() => {
    usePlayerStore.setState({ pitch: 0, currentTrackId: 't' });
  });
  afterEach(cleanup);

  it('raises a semitone', () => {
    render(<PitchPanel />);
    fireEvent.click(screen.getByLabelText('выше'));
    expect(usePlayerStore.getState().pitch).toBe(1);
  });

  it('lowers a semitone', () => {
    render(<PitchPanel />);
    fireEvent.click(screen.getByLabelText('ниже'));
    expect(usePlayerStore.getState().pitch).toBe(-1);
  });

  it('resets to 0 on a tap on the value', () => {
    usePlayerStore.setState({ pitch: 3 });
    render(<PitchPanel />);
    expect(screen.getByText('+3')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('сбросить тон'));
    expect(usePlayerStore.getState().pitch).toBe(0);
  });
});

describe('LoopPanel', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      currentTrackId: 't',
      loopStart: null,
      loopEnd: null,
      position: 42,
      duration: 100,
    });
  });
  afterEach(cleanup);

  // Also guards the zustand v5 gotcha: this component selects an object from
  // the store, so without useShallow React trips "getSnapshot should be cached"
  // and the component never mounts.
  it('shows A/B times once set and disables reset until both exist', () => {
    render(<LoopPanel />);
    expect(screen.getByText('Сброс')).toBeDisabled();

    fireEvent.click(screen.getByText('A'));
    expect(usePlayerStore.getState().loopStart).toBe(42);
    expect(screen.getByText('A 0:42')).toBeInTheDocument();
  });

  it('clears the loop', () => {
    usePlayerStore.setState({ loopStart: 10, loopEnd: 20 });
    render(<LoopPanel />);
    fireEvent.click(screen.getByText('Сброс'));
    expect(usePlayerStore.getState().loopStart).toBeNull();
    expect(usePlayerStore.getState().loopEnd).toBeNull();
  });
});

describe('MarkersPanel', () => {
  beforeEach(() => {
    usePlayerStore.setState({ markers: [], position: 7, currentTrackId: 't' });
  });
  afterEach(cleanup);

  it('adds a marker at the current position', () => {
    render(<MarkersPanel />);
    fireEvent.click(screen.getByText('＋ маркер'));
    expect(usePlayerStore.getState().markers).toHaveLength(1);
    expect(usePlayerStore.getState().markers[0].time).toBe(7);
  });

  it('disables nav/delete when there are no markers', () => {
    render(<MarkersPanel />);
    expect(screen.getByLabelText('следующий маркер')).toBeDisabled();
    expect(screen.getByLabelText('предыдущий маркер')).toBeDisabled();
    expect(screen.getByLabelText('удалить маркер')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run src/ui/panels.test.tsx`
Expected: FAIL — `Cannot find module './PitchPanel'`.

- [ ] **Step 3: Реализовать три панели**

Create `src/ui/PitchPanel.tsx`:

```tsx
import { usePlayerStore } from '../store/usePlayerStore';

// A fragment, not a wrapper: ControlTabs supplies div.popover, which is what
// keeps all three panels exactly one row tall.
export function PitchPanel() {
  const pitch = usePlayerStore((s) => s.pitch);
  const setPitch = usePlayerStore((s) => s.setPitch);
  return (
    <>
      <button aria-label="ниже" onClick={() => setPitch(pitch - 1)}>
        −
      </button>
      <button className="val" aria-label="сбросить тон" onClick={() => setPitch(0)}>
        {pitch > 0 ? `+${pitch}` : pitch}
      </button>
      <button aria-label="выше" onClick={() => setPitch(pitch + 1)}>
        ＋
      </button>
    </>
  );
}
```

Create `src/ui/LoopPanel.tsx`:

```tsx
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { fmtTime } from './time';

export function LoopPanel() {
  // zustand v5: selecting a freshly-built object every render (without
  // useShallow) causes an infinite re-render loop ("getSnapshot should be
  // cached"). useShallow memoizes by shallow-equality of the returned fields.
  const { loopStart, loopEnd, setLoopA, setLoopB, clearLoop } = usePlayerStore(
    useShallow((s) => ({
      loopStart: s.loopStart,
      loopEnd: s.loopEnd,
      setLoopA: s.setLoopA,
      setLoopB: s.setLoopB,
      clearLoop: s.clearLoop,
    }))
  );
  const active = loopStart !== null && loopEnd !== null;
  return (
    <>
      <button onClick={setLoopA}>{loopStart !== null ? `A ${fmtTime(loopStart)}` : 'A'}</button>
      <button onClick={setLoopB}>{loopEnd !== null ? `B ${fmtTime(loopEnd)}` : 'B'}</button>
      <button onClick={clearLoop} disabled={!active}>
        Сброс
      </button>
    </>
  );
}
```

Create `src/ui/MarkersPanel.tsx`:

```tsx
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';

export function MarkersPanel() {
  // zustand v5: a fresh-object selector needs useShallow (see LoopPanel).
  const { markers, addMarker, removeMarker, seekPrevMarker, seekNextMarker } = usePlayerStore(
    useShallow((s) => ({
      markers: s.markers,
      addMarker: s.addMarker,
      removeMarker: s.removeMarker,
      seekPrevMarker: s.seekPrevMarker,
      seekNextMarker: s.seekNextMarker,
    }))
  );
  const has = markers.length > 0;
  return (
    <>
      <button aria-label="предыдущий маркер" onClick={seekPrevMarker} disabled={!has}>
        ◀
      </button>
      <button className="primary" onClick={addMarker}>
        ＋ маркер
      </button>
      <button aria-label="следующий маркер" onClick={seekNextMarker} disabled={!has}>
        ▶
      </button>
      <button aria-label="удалить маркер" onClick={removeMarker} disabled={!has}>
        −
      </button>
    </>
  );
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run src/ui/panels.test.tsx`
Expected: PASS (7 тестов).

- [ ] **Step 5: Коммит**

```bash
git add src/ui/PitchPanel.tsx src/ui/LoopPanel.tsx src/ui/MarkersPanel.tsx src/ui/panels.test.tsx
git commit -m "feat(ui): pitch/loop/markers panels for the tab popover"
```

---

### Task 6: `ControlTabs` — чипы-табы и поповер-оверлей

**Files:**
- Create: `src/ui/ControlTabs.tsx`, `src/ui/ControlTabs.test.tsx`

**Interfaces:**
- Consumes: `<PitchPanel />`, `<LoopPanel />`, `<MarkersPanel />`; `usePlayerStore` (`pitch`, `loopStart`, `loopEnd`, `markers`).
- Produces: `<ControlTabs />` — `div.chips[role=tablist]` с тремя `button[role=tab]` (`aria-selected`) и, когда таб открыт, `div.popover[role=tabpanel]` + `div.backdrop`.

- [ ] **Step 1: Написать падающий тест**

Create `src/ui/ControlTabs.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { ControlTabs } from './ControlTabs';

describe('ControlTabs', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      currentTrackId: 't',
      pitch: 0,
      loopStart: null,
      loopEnd: null,
      markers: [],
      position: 0,
      duration: 100,
    });
  });
  afterEach(cleanup);

  it('shows no panel until a chip is tapped', () => {
    render(<ControlTabs />);
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('opens the panel of the tapped chip', () => {
    render(<ControlTabs />);
    fireEvent.click(screen.getByRole('tab', { name: /тон/i }));
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    expect(screen.getByLabelText('выше')).toBeInTheDocument();
  });

  // The whole point of tabs over popovers: with a panel open, the chips stay
  // tappable and switch what the panel shows.
  it('switches between tabs while the panel is open', () => {
    render(<ControlTabs />);
    fireEvent.click(screen.getByRole('tab', { name: /тон/i }));
    fireEvent.click(screen.getByRole('tab', { name: /маркер/i }));
    expect(screen.getByText('＋ маркер')).toBeInTheDocument();
    expect(screen.queryByLabelText('выше')).toBeNull();
    expect(screen.getByRole('tab', { name: /маркер/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /тон/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('closes the panel on a tap on the active chip', () => {
    render(<ControlTabs />);
    const chip = screen.getByRole('tab', { name: /тон/i });
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('chips show state without opening a panel', () => {
    usePlayerStore.setState({
      pitch: 2,
      loopStart: 1,
      loopEnd: 5,
      markers: [
        { id: 'a', time: 1, label: '1' },
        { id: 'b', time: 2, label: '2' },
      ],
    });
    render(<ControlTabs />);
    expect(screen.getByRole('tab', { name: /тон \+2/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /A–B ✓/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /⚑ 2/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/ui/ControlTabs.test.tsx`
Expected: FAIL — `Cannot find module './ControlTabs'`.

- [ ] **Step 3: Реализовать**

Create `src/ui/ControlTabs.tsx`:

```tsx
import { useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { PitchPanel } from './PitchPanel';
import { LoopPanel } from './LoopPanel';
import { MarkersPanel } from './MarkersPanel';

type Tab = 'pitch' | 'loop' | 'markers';

export function ControlTabs() {
  // Which panel is open is UI state, not track state: it never goes into the
  // store and must never reach IndexedDB.
  const [open, setOpen] = useState<Tab | null>(null);

  // zustand v5: a fresh-object selector needs useShallow (see LoopPanel).
  const { pitch, loopSet, markerCount } = usePlayerStore(
    useShallow((s) => ({
      pitch: s.pitch,
      loopSet: s.loopStart !== null && s.loopEnd !== null,
      markerCount: s.markers.length,
    }))
  );

  const toggle = (t: Tab) => setOpen((cur) => (cur === t ? null : t));

  return (
    <>
      {open !== null && (
        <>
          {/* Covers the canvases on purpose: with a panel open, a tap outside
              should close it rather than scrub the waveform. */}
          <div className="backdrop" onClick={() => setOpen(null)} />
          {/* An overlay anchored to the dock, NOT a row in it — opening a panel
              must not resize the waveform. */}
          <div className="popover" role="tabpanel">
            {open === 'pitch' && <PitchPanel />}
            {open === 'loop' && <LoopPanel />}
            {open === 'markers' && <MarkersPanel />}
          </div>
        </>
      )}
      <div className="chips" role="tablist">
        <button
          role="tab"
          aria-selected={open === 'pitch'}
          className={pitch !== 0 ? 'on' : undefined}
          onClick={() => toggle('pitch')}
        >
          ♪ Тон {pitch > 0 ? `+${pitch}` : pitch}
        </button>
        <button
          role="tab"
          aria-selected={open === 'loop'}
          className={loopSet ? 'on' : undefined}
          onClick={() => toggle('loop')}
        >
          A–B {loopSet ? '✓' : ''}
        </button>
        <button
          role="tab"
          aria-selected={open === 'markers'}
          className={markerCount > 0 ? 'on' : undefined}
          onClick={() => toggle('markers')}
        >
          ⚑ {markerCount}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Прогнать тест**

Run: `npx vitest run src/ui/ControlTabs.test.tsx`
Expected: PASS (5 тестов).

- [ ] **Step 5: Коммит**

```bash
git add src/ui/ControlTabs.tsx src/ui/ControlTabs.test.tsx
git commit -m "feat(ui): ControlTabs — chips as tabs with an overlay popover"
```

---

### Task 7: `TransportBar` (только play), `TimeBadge`, `PlayerHeader`, `PlayerDock`

**Files:**
- Modify: `src/ui/TransportBar.tsx` (полная перезапись)
- Create: `src/ui/TimeBadge.tsx`, `src/ui/PlayerHeader.tsx`, `src/ui/PlayerDock.tsx`, `src/ui/dock.test.tsx`

**Interfaces:**
- Consumes: `usePlayerStore` (`playing`, `togglePlay`, `position`, `duration`, `library`, `currentTrackId`, `closeTrack`); `fmtTime` из `src/ui/time`; `<TempoStepper />`, `<ControlTabs />`.
- Produces: `<TransportBar />` (`div.transport` с одной кнопкой `.play`, `aria-label` `играть`/`пауза`); `<TimeBadge />` (`div.time-badge`); `<PlayerHeader />` (`header.player-header`, кнопка `aria-label="назад"`); `<PlayerDock />` (`div.dock` = `TempoStepper` + `TransportBar` + `ControlTabs`).

- [ ] **Step 1: Написать падающий тест**

Create `src/ui/dock.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { TransportBar } from './TransportBar';
import { TimeBadge } from './TimeBadge';
import { PlayerHeader } from './PlayerHeader';
import { PlayerDock } from './PlayerDock';

describe('TransportBar', () => {
  beforeEach(() => {
    usePlayerStore.setState({ currentTrackId: 't', playing: false, position: 0, duration: 100 });
  });
  afterEach(cleanup);

  // Also guards the zustand v5 gotcha: an object selector without useShallow
  // trips "getSnapshot should be cached" and the component never mounts.
  it('mounts with only a play button — no ±5s, no time', () => {
    render(<TransportBar />);
    expect(screen.getByLabelText('играть')).toBeInTheDocument();
    expect(screen.queryByText('−5')).toBeNull();
    expect(screen.queryByText('+5')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('TimeBadge', () => {
  afterEach(cleanup);

  it('shows position and duration', () => {
    usePlayerStore.setState({ currentTrackId: 't', position: 84, duration: 238 });
    render(<TimeBadge />);
    expect(screen.getByText(/1:24/)).toBeInTheDocument();
    expect(screen.getByText(/3:58/)).toBeInTheDocument();
  });
});

describe('PlayerHeader', () => {
  afterEach(cleanup);

  it('shows the current track name and closes the track', () => {
    // TrackRecord (src/types.ts) needs blob + peaks — the header only reads
    // `name`, but the type is the type.
    usePlayerStore.setState({
      currentTrackId: 't1',
      library: [
        {
          id: 't1',
          name: 'song.mp3',
          blob: new Blob(),
          peaks: new Float32Array(0),
          duration: 100,
          createdAt: 0,
        },
      ],
    });
    render(<PlayerHeader />);
    expect(screen.getByText('song.mp3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('назад'));
    expect(usePlayerStore.getState().currentTrackId).toBeNull();
  });
});

describe('PlayerDock', () => {
  afterEach(cleanup);

  it('stacks tempo, transport and the chips', () => {
    usePlayerStore.setState({
      currentTrackId: 't',
      tempo: 1,
      pitch: 0,
      playing: false,
      loopStart: null,
      loopEnd: null,
      markers: [],
      position: 0,
      duration: 100,
    });
    render(<PlayerDock />);
    expect(screen.getByLabelText('сбросить темп')).toBeInTheDocument();
    expect(screen.getByLabelText('играть')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/ui/dock.test.tsx`
Expected: FAIL — `Cannot find module './TimeBadge'`.

- [ ] **Step 3: Переписать `src/ui/TransportBar.tsx`**

```tsx
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';

// Play only. Seeking ±5s went away with the redesign: the waveform is a pan
// gesture and the minimap is a relative scrub, both of which beat a 5s hop.
export function TransportBar() {
  // zustand v5: a fresh-object selector needs useShallow (see LoopPanel).
  const { playing, togglePlay } = usePlayerStore(
    useShallow((s) => ({ playing: s.playing, togglePlay: s.togglePlay }))
  );
  return (
    <div className="transport">
      <button aria-label={playing ? 'пауза' : 'играть'} className="play" onClick={togglePlay}>
        {playing ? '❚❚' : '▶'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Создать `src/ui/TimeBadge.tsx`**

```tsx
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { fmtTime } from './time';

// Sits on top of the waveform (see .time-badge in styles.css: pointer-events
// is none, so a pan gesture starting under it still reaches the canvas).
export function TimeBadge() {
  // zustand v5: a fresh-object selector needs useShallow (see LoopPanel).
  const { position, duration } = usePlayerStore(
    useShallow((s) => ({ position: s.position, duration: s.duration }))
  );
  return (
    <div className="time-badge">
      {fmtTime(position)} <span className="total">/ {fmtTime(duration)}</span>
    </div>
  );
}
```

- [ ] **Step 5: Создать `src/ui/PlayerHeader.tsx`**

```tsx
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';

export function PlayerHeader() {
  // zustand v5: a fresh-object selector needs useShallow (see LoopPanel).
  const { name, closeTrack } = usePlayerStore(
    useShallow((s) => ({
      name: s.library.find((t) => t.id === s.currentTrackId)?.name ?? '',
      closeTrack: s.closeTrack,
    }))
  );
  return (
    <header className="player-header">
      <button className="back" aria-label="назад" onClick={closeTrack}>
        ‹ Библиотека
      </button>
      <span className="track-name">{name}</span>
    </header>
  );
}
```

- [ ] **Step 6: Создать `src/ui/PlayerDock.tsx`**

```tsx
import { TempoStepper } from './TempoStepper';
import { TransportBar } from './TransportBar';
import { ControlTabs } from './ControlTabs';

// The dock is the popover's positioning context (position: relative in CSS),
// which is what lets ControlTabs overlay its panel instead of pushing rows.
export function PlayerDock() {
  return (
    <div className="dock">
      <TempoStepper />
      <TransportBar />
      <ControlTabs />
    </div>
  );
}
```

- [ ] **Step 7: Прогнать тест**

Run: `npx vitest run src/ui/dock.test.tsx`
Expected: PASS (4 теста).

- [ ] **Step 8: Коммит**

```bash
git add src/ui/TransportBar.tsx src/ui/TimeBadge.tsx src/ui/PlayerHeader.tsx src/ui/PlayerDock.tsx src/ui/dock.test.tsx
git commit -m "feat(ui): dock — play-only transport, time badge, header"
```

---

### Task 8: Пересобрать `Player.tsx` и удалить старые контролы

**Files:**
- Modify: `src/screens/Player.tsx` (полная перезапись), `src/ui/controls.test.tsx` (перезапись)
- Delete: `src/ui/TempoControl.tsx`, `src/ui/PitchControl.tsx`, `src/ui/LoopControls.tsx`, `src/ui/MarkersControl.tsx`, `src/ui/MarkersControl.test.tsx`

**Interfaces:**
- Consumes: `<PlayerHeader />`, `<WaveformCanvas />`, `<TimeBadge />`, `<MiniMap />`, `<PlayerDock />`.
- Produces: `<Player />` — `div.player` (flex-колонка на всю высоту).

- [ ] **Step 1: Переписать `src/screens/Player.tsx`**

```tsx
import { WaveformCanvas } from '../waveform/WaveformCanvas';
import { MiniMap } from '../waveform/MiniMap';
import { PlayerHeader } from '../ui/PlayerHeader';
import { TimeBadge } from '../ui/TimeBadge';
import { PlayerDock } from '../ui/PlayerDock';

export function Player() {
  return (
    <div className="player">
      <PlayerHeader />
      {/* The badge is positioned against this wrapper, not the canvas: a canvas
          cannot have children. */}
      <div className="wave-wrap">
        <WaveformCanvas />
        <TimeBadge />
      </div>
      <MiniMap />
      <PlayerDock />
    </div>
  );
}
```

- [ ] **Step 2: Удалить старые контролы и их тест**

```bash
git rm src/ui/TempoControl.tsx src/ui/PitchControl.tsx src/ui/LoopControls.tsx src/ui/MarkersControl.tsx src/ui/MarkersControl.test.tsx
```

- [ ] **Step 3: Заменить `src/ui/controls.test.tsx`**

Старый файл целиком импортировал удалённые компоненты. Его содержимое (проверка темпа, тона, лупа, транспорта) уже покрыто `TempoStepper.test.tsx`, `panels.test.tsx` и `dock.test.tsx`, поэтому файл удаляется:

```bash
git rm src/ui/controls.test.tsx
```

- [ ] **Step 4: Прогнать весь набор тестов**

Run: `npm test`
Expected: PASS — все файлы; ни одного `Cannot find module './TempoControl'`.

- [ ] **Step 5: Тип-чек (отдельный шаг — сборка типы не проверяет)**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 6: Коммит**

```bash
git add src/screens/Player.tsx
git commit -m "feat(ui): recompose the player screen around the new dock"
```

---

### Task 9: Перекрасить канвасы

**Files:**
- Modify: `src/waveform/WaveformCanvas.tsx:39,55,69,81,87`, `src/waveform/MiniMap.tsx:108,125,131,141`

**Interfaces:**
- Consumes: `activePalette()` из `src/ui/theme`.
- Produces: ничего нового.

> **Только цвета.** Никаких правок логики рисования, dirty-check, backing store и обработчиков касаний.

- [ ] **Step 1: `WaveformCanvas.tsx` — брать палитру раз в кадр**

В `src/waveform/WaveformCanvas.tsx` добавить импорт:

```ts
import { activePalette } from '../ui/theme';
```

Внутри `draw()`, сразу после `const s = store.getState();`, добавить:

```ts
      const p = activePalette();
```

Затем заменить пять хардкодов:

- строка с `g.fillStyle = 'rgba(90,160,255,0.18)';` (заливка лупа) → `g.fillStyle = p.loopFill;`
- строка с `g.strokeStyle = '#5aa0ff';` (пики) → `g.strokeStyle = p.accent;`
- строка с `g.strokeStyle = '#ff5a5a';` (плейхед) → `g.strokeStyle = p.playhead;`
- в цикле маркеров `g.strokeStyle = '#ffcf5a';` → `g.strokeStyle = p.marker;`
- в цикле маркеров `g.fillStyle = '#ffcf5a';` → `g.fillStyle = p.marker;`

Комментарий над маркерами («shows its amber tick over the centered red playhead line») поправить, чтобы он не врал про цвета:

```ts
      // markers (drawn after the playhead so a marker at the current position
      // shows its tick over the centered playhead line)
```

- [ ] **Step 2: `MiniMap.tsx` — то же самое**

В `src/waveform/MiniMap.tsx` добавить импорт:

```ts
import { activePalette } from '../ui/theme';
```

Внутри `draw()`, **после** гейта dirty-check (`if (clean) { … return; }`) и после `g.clearRect(...)`, добавить:

```ts
      const p = activePalette();
```

Заменить четыре хардкода:

- `g.strokeStyle = '#3f6ea8';` (пики) → `g.strokeStyle = p.minimapPeaks;`
- `g.fillStyle = 'rgba(90,160,255,0.22)';` (заливка лупа) → `g.fillStyle = p.loopFill;`
- `g.strokeStyle = '#ff5a5a';` (плейхед) → `g.strokeStyle = p.playhead;`
- `g.strokeStyle = '#ffcf5a';` (маркеры) → `g.strokeStyle = p.marker;`

Комментарий про «swallowed by the red line» поправить на «swallowed by the playhead line».

- [ ] **Step 3: Проверить, что в канвасах не осталось хардкодов**

Run: `grep -n "#[0-9a-fA-F]\{3,6\}\|rgba(" src/waveform/WaveformCanvas.tsx src/waveform/MiniMap.tsx`
Expected: пусто.

- [ ] **Step 4: Тесты и тип-чек**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, ошибок типов нет.

- [ ] **Step 5: Коммит**

```bash
git add src/waveform/WaveformCanvas.tsx src/waveform/MiniMap.tsx
git commit -m "feat(waveform): canvases take their colours from the theme"
```

---

### Task 10: Финальная проверка

**Files:** нет правок (кроме фиксов, если что-то всплывёт)

- [ ] **Step 1: Полный прогон**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: всё зелёное, сборка проходит.

- [ ] **Step 2: Проверить, что база не сломалась (см. CLAUDE.md, гоча 8)**

```bash
grep -o '"scope":"[^"]*"' dist/manifest.webmanifest   # -> /lena-audio-player/
grep -c soundtouch-processor dist/sw.js               # >= 1
grep -o 'apple-touch-icon[^>]*' dist/index.html       # href отрефейзен
grep -o '"theme_color":"[^"]*"' dist/manifest.webmanifest  # -> #17150f
```

- [ ] **Step 3: Ручная проверка в `npm run preview`** (структурно тестами не покрывается)

- [ ] Звук играет (значит `WORKLET_URL` жив), темп меняется кнопками ±0.1, тап по значению возвращает 1.00×.
- [ ] Панель таба открывается **поверх** волны, ничего не сдвигая; переключение между чипами при открытой панели работает; тап по активному чипу и тап вне панели — закрывают.
- [ ] Жесты на волне (пан/пинч) и относительный скраб минимапы работают как раньше; плашка времени не перехватывает касания.
- [ ] Док не залезает под home indicator, шапка — под статус-бар (iOS standalone).
- [ ] Читаемость янтарной палитры: **виден ли регион A-B лупа поверх янтарной волны.** Если нет — поменять `loopFill` в `theme.ts` и `--loop-fill` в `styles.css` на бирюзовый `rgba(139,224,255,0.16)` (обе правки обязательны, иначе упадёт `theme.test.ts`).
- [ ] Библиотека не развалилась (она вне скоупа, но использует те же токены).
- [ ] Тема `studio` включается через `localStorage.setItem('razbor.theme','studio')` + перезагрузка.

- [ ] **Step 4: Обновить CLAUDE.md**

Секции, которые устарели: список UI-компонентов в «Architecture» (пункт 1), «Currently 14 test files / 81 tests», упоминания `TempoControl`/`LoopControls`/`MarkersControl`. Добавить: `theme.ts` — единственный источник цвета, парность с `styles.css` пинится тестом; канвасы берут цвета из палитры.

- [ ] **Step 5: Коммит**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md after the player UI redesign"
```
