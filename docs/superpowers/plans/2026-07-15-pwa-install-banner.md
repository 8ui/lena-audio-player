# PWA Install Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a dismissible bottom banner inviting the user to install the PWA when "Разбор" is opened in a Chrome/Android browser and not yet installed.

**Architecture:** PWA/browser logic lives in a new `src/pwa/installPrompt.ts` (sibling of `wakeLock.ts`) that captures the `beforeinstallprompt` event and exposes a `useSyncExternalStore`-shaped subscribe/getSnapshot plus a pure `shouldShowInstallBanner`. A thin `src/ui/InstallBanner.tsx` renders from it. The banner lives on the Library screen (the browser entry point), keeping it clear of the Player dock.

**Tech Stack:** React 19 (`useSyncExternalStore`), TypeScript, Vitest 4 + React Testing Library, CSS variables for theming, vite-plugin-pwa (already configured).

## Global Constraints

- **Base path:** app is served from `base: '/lena-audio-player/'`; no new asset URLs are introduced by this feature, so nothing to rebase here.
- **Theming:** every colour comes from a CSS variable under `:root[data-theme='warm'|'studio']` in `src/ui/styles.css` — NO hardcoded hex in components. Available vars: `--elevated`, `--border`, `--text`, `--muted`, `--accent`, `--on-accent`, `--r-lg` (20px), `--r-md` (14px).
- **Copy is Russian:** UI text in Russian ("Установить", "Закрыть", etc.).
- **Push logic out of components:** the pure decision (`shouldShowInstallBanner`) is unit-tested; the component is a thin adapter.
- **Store is untouched:** this is a PWA/browser concern like `wakeLock`, NOT Zustand store state.
- **Safe-area insets:** any bottom-anchored fixed element uses `env(safe-area-inset-bottom)` (standalone full-bleed), matching the dock and error banner.
- **Device-only truth:** jsdom does not fire `beforeinstallprompt`; the real event, `event.prompt()`, `appinstalled`, and installation are manual device checks.

---

### Task 1: `installPrompt` module + pure decision function

**Files:**
- Create: `src/pwa/installPrompt.ts`
- Test: `src/pwa/installPrompt.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module; browser globals `window`, `localStorage`, `navigator`).
- Produces:
  - `interface InstallState { canInstall: boolean; dismissed: boolean }`
  - `subscribe(cb: () => void): () => void`
  - `getSnapshot(): InstallState`
  - `isStandalone(): boolean`
  - `promptInstall(): Promise<void>`
  - `dismiss(): void`
  - `shouldShowInstallBanner(s: { canInstall: boolean; standalone: boolean; dismissed: boolean }): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/pwa/installPrompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldShowInstallBanner } from './installPrompt';

describe('shouldShowInstallBanner', () => {
  it('shows when installable, not standalone, not dismissed', () => {
    expect(
      shouldShowInstallBanner({ canInstall: true, standalone: false, dismissed: false }),
    ).toBe(true);
  });

  it('hides when not installable', () => {
    expect(
      shouldShowInstallBanner({ canInstall: false, standalone: false, dismissed: false }),
    ).toBe(false);
  });

  it('hides when already running standalone (installed)', () => {
    expect(
      shouldShowInstallBanner({ canInstall: true, standalone: true, dismissed: false }),
    ).toBe(false);
  });

  it('hides when the user dismissed it', () => {
    expect(
      shouldShowInstallBanner({ canInstall: true, standalone: false, dismissed: true }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pwa/installPrompt.test.ts`
Expected: FAIL — `shouldShowInstallBanner` is not exported / module not found.

- [ ] **Step 3: Write the module**

Create `src/pwa/installPrompt.ts`:

```ts
// The install-prompt lives here, next to wakeLock.ts, because it is a
// PWA/browser concern — NOT Zustand store state. The `beforeinstallprompt`
// event can fire before React mounts, so the listener is registered at module
// load (this module is imported for its side effect in main.tsx).

// BeforeInstallPromptEvent isn't in lib.dom yet; declare the minimal shape.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'razbor.installDismissed';

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export interface InstallState {
  canInstall: boolean;
  dismissed: boolean;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false; // storage blocked (private mode) — treat as not dismissed
  }
}

// useSyncExternalStore caches by reference: getSnapshot must return a stable
// object while nothing changed. Rebuild it only on emit().
let snapshot: InstallState = { canInstall: false, dismissed: readDismissed() };

function emit(): void {
  snapshot = { canInstall: deferred !== null, dismissed: readDismissed() };
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Chrome would otherwise show its own mini-infobar; we drive the UI.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null; // installed — nothing left to prompt
    emit();
  });
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getSnapshot(): InstallState {
  return snapshot;
}

export function isStandalone(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  }
  return (
    typeof navigator !== 'undefined' &&
    (navigator as { standalone?: boolean }).standalone === true // iOS Safari
  );
}

export async function promptInstall(): Promise<void> {
  const e = deferred;
  if (!e) return;
  deferred = null; // one-shot: a used beforeinstallprompt event can't re-prompt
  emit();
  try {
    await e.prompt();
    await e.userChoice;
  } catch {
    /* user dismissed the native dialog, or it's unavailable */
  }
}

export function dismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* storage blocked — banner will simply reappear next visit */
  }
  emit();
}

export function shouldShowInstallBanner(s: {
  canInstall: boolean;
  standalone: boolean;
  dismissed: boolean;
}): boolean {
  return s.canInstall && !s.standalone && !s.dismissed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pwa/installPrompt.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pwa/installPrompt.ts src/pwa/installPrompt.test.ts
git commit -m "feat(pwa): install-prompt module with pure shouldShow decision"
```

---

### Task 2: `InstallBanner` component

**Files:**
- Create: `src/ui/InstallBanner.tsx`
- Test: `src/ui/InstallBanner.test.tsx`

**Interfaces:**
- Consumes from Task 1: `subscribe`, `getSnapshot`, `isStandalone`, `promptInstall`, `dismiss`, `shouldShowInstallBanner`.
- Produces: `export function InstallBanner(): JSX.Element | null`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/InstallBanner.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { InstallBanner } from './InstallBanner';

// jsdom never fires beforeinstallprompt on its own; dispatch a real event to
// exercise the module's actual capture + subscribe/getSnapshot wiring.
function fireBeforeInstallPrompt() {
  const e = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  act(() => {
    window.dispatchEvent(e);
  });
  return e;
}

describe('InstallBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the module's stashed event between tests (appinstalled nulls it).
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
  });
  afterEach(cleanup);

  it('renders nothing until beforeinstallprompt fires', () => {
    render(<InstallBanner />);
    expect(screen.queryByText('Установить')).toBeNull();
  });

  it('shows the banner after beforeinstallprompt fires', () => {
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    expect(screen.getByText('Установить')).toBeInTheDocument();
  });

  it('calls the browser prompt when Установить is clicked', () => {
    render(<InstallBanner />);
    const e = fireBeforeInstallPrompt();
    fireEvent.click(screen.getByText('Установить'));
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });

  it('dismisses and stays hidden after ✕, remembering it in localStorage', () => {
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    fireEvent.click(screen.getByLabelText('Закрыть'));
    expect(screen.queryByText('Установить')).toBeNull();
    expect(localStorage.getItem('razbor.installDismissed')).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/InstallBanner.test.tsx`
Expected: FAIL — `InstallBanner` not exported / module not found.

- [ ] **Step 3: Write the component**

Create `src/ui/InstallBanner.tsx`:

```tsx
import { useSyncExternalStore } from 'react';
import {
  subscribe,
  getSnapshot,
  isStandalone,
  promptInstall,
  dismiss,
  shouldShowInstallBanner,
} from '../pwa/installPrompt';

export function InstallBanner() {
  const { canInstall, dismissed } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot, // no SSR here; reuse for getServerSnapshot
  );

  // isStandalone() does not change during a session, so it need not be reactive.
  if (!shouldShowInstallBanner({ canInstall, standalone: isStandalone(), dismissed })) {
    return null;
  }

  return (
    <div className="install-banner" role="dialog" aria-label="Установить приложение">
      <span className="install-banner__text">Установить «Разбор» на устройство</span>
      <div className="install-banner__actions">
        <button className="install-banner__install" onClick={() => void promptInstall()}>
          Установить
        </button>
        <button
          className="install-banner__close"
          aria-label="Закрыть"
          onClick={() => dismiss()}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/InstallBanner.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/InstallBanner.tsx src/ui/InstallBanner.test.tsx
git commit -m "feat(ui): InstallBanner component driven by installPrompt module"
```

---

### Task 3: Styling, layer-order test, and wiring

**Files:**
- Modify: `src/ui/styles.css` (add `.install-banner` block + FAB lift)
- Modify: `src/ui/libraryLayers.test.ts` (assert banner z-order)
- Modify: `src/screens/Library.tsx` (render `<InstallBanner />`)
- Modify: `src/main.tsx` (early side-effect import)
- Modify: `CLAUDE.md` (document the feature + device-only note)

**Interfaces:**
- Consumes from Task 2: `InstallBanner`.
- Produces: nothing consumed by later tasks (terminal task).

- [ ] **Step 1: Write the failing layer-order test**

Add this `it` block inside the existing `describe('library layer order', ...)` in `src/ui/libraryLayers.test.ts` (the file already defines `cssBlock` / `cssProp` helpers — reuse them):

```ts
  // The install banner floats over the track list (above the FAB, z-index 30)
  // but must stay BELOW the sheet backdrop (40) so an open track sheet covers
  // it. jsdom can't hit-test, so pin it from the stylesheet.
  it('keeps the install banner above the FAB but below the sheet backdrop', () => {
    const bannerZ = Number(cssProp(cssBlock('.install-banner'), 'z-index'));
    const fabZ = Number(cssProp(cssBlock('.import-fab'), 'z-index'));
    const backdropZ = Number(cssProp(cssBlock('.sheet-backdrop'), 'z-index'));
    expect(Number.isNaN(bannerZ), '.install-banner must declare a z-index').toBe(false);
    expect(bannerZ).toBeGreaterThan(fabZ);
    expect(bannerZ).toBeLessThan(backdropZ);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/libraryLayers.test.ts`
Expected: FAIL — `styles.css has no .install-banner rule`.

- [ ] **Step 3: Add the CSS**

Append to `src/ui/styles.css` (after the `.import-fab` rule, near the other library rules):

```css
/* Browser-only install invite. z-index 35: ABOVE the FAB/header (30) so it
   floats over the track list, but BELOW .sheet-backdrop (40) so an open track
   sheet still covers it (pinned by libraryLayers.test.ts). Every colour is a
   CSS variable — it re-themes for free, no redraw. */
.install-banner {
  position: fixed;
  right: 12px;
  bottom: 0;
  left: 12px;
  z-index: 35;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  /* Standalone full-bleed: keep the actions clear of the home indicator. */
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  background: var(--elevated);
  border: 1px solid var(--border);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  color: var(--text);
  box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.4);
}
.install-banner__text {
  flex: 1;
  font-size: 14px;
  line-height: 1.3;
}
.install-banner__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.install-banner__install {
  padding: 0 16px;
  height: 40px;
  border-radius: var(--r-md);
  background: var(--accent);
  color: var(--on-accent);
  font-size: 14px;
  font-weight: 600;
}
.install-banner__close {
  width: 40px;
  height: 40px;
  background: transparent;
  color: var(--muted);
  font-size: 18px;
}
/* Lift the FAB above the banner while it is shown so they don't overlap.
   :has() is supported on the same modern Chrome/Safari that fire the install
   event, so it degrades harmlessly where the banner never appears anyway. */
.library:has(.install-banner) .import-fab {
  bottom: calc(84px + env(safe-area-inset-bottom));
}
```

- [ ] **Step 4: Run the layer-order test to verify it passes**

Run: `npx vitest run src/ui/libraryLayers.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the banner in Library**

In `src/screens/Library.tsx`:

Add the import near the other `../ui/*` imports:

```tsx
import { InstallBanner } from '../ui/InstallBanner';
```

Then render `<InstallBanner />` as the last child inside the `.library` div, right after the `{sheetTrack && (...)}` block and before the closing `</div>`:

```tsx
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

      <InstallBanner />
    </div>
  );
}
```

- [ ] **Step 6: Register the listener early in main.tsx**

In `src/main.tsx`, add the side-effect import so the `beforeinstallprompt`
listener is attached at page load (before React renders). Add it after the
`applyTheme` import line:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme } from './ui/theme';
// Side-effect import: registers the beforeinstallprompt listener at page load,
// since the event can fire before React mounts.
import './pwa/installPrompt';
```

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS — all prior tests plus the new cases: 4 in `installPrompt.test.ts`, 4 in `InstallBanner.test.tsx`, and 1 added to `libraryLayers.test.ts` (≈195 tests / 29 files, up from 186 / 27).

- [ ] **Step 8: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed (build proves the side-effect import and JSX are wired; `tsc` alone would not catch a config issue, but there are no config changes here).

- [ ] **Step 9: Document in CLAUDE.md**

In `CLAUDE.md`, under the "Plus a thin **PWA shell**" paragraph (end of the
Architecture section), extend the sentence listing `wakeLock.ts` to also mention
the install banner. Change:

```
Plus a thin **PWA shell**: `src/pwa/wakeLock.ts` (screen wake lock while
playing) and `vite-plugin-pwa` (manifest + service worker, configured in
`vite.config.ts`) for offline/installable behavior.
```

to:

```
Plus a thin **PWA shell**: `src/pwa/wakeLock.ts` (screen wake lock while
playing), `src/pwa/installPrompt.ts` (captures `beforeinstallprompt`, drives
the dismissible `src/ui/InstallBanner.tsx` shown on the Library screen in a
browser — Chrome/Android only; iOS Safari has no such event, so it gets no
banner), and `vite-plugin-pwa` (manifest + service worker, configured in
`vite.config.ts`) for offline/installable behavior.
```

Then add a bullet to the "What's tested vs. what's manually verified" →
"What tests structurally cannot cover here" list:

```
the `beforeinstallprompt` capture and native install flow (`event.prompt()`,
`appinstalled`) — jsdom never fires the event, so `InstallBanner.test.tsx`
dispatches a synthetic one; real install is device-only.
```

- [ ] **Step 10: Commit**

```bash
git add src/ui/styles.css src/ui/libraryLayers.test.ts src/screens/Library.tsx src/main.tsx CLAUDE.md
git commit -m "feat(pwa): show dismissible install banner on the library screen"
```

---

## Manual verification (device-only, after the plan)

Not automatable — do these on a real Chrome/Android device (or Chrome desktop with the tunnel):

1. `npm run build && npm run preview` (or the cloudflared tunnel over HTTPS).
2. Open in Chrome, not installed → banner appears at the bottom once Chrome fires `beforeinstallprompt`; the import FAB sits above it (no overlap).
3. Tap "Установить" → native install dialog appears; accepting installs the app; the banner disappears.
4. Reopen in the browser tab → banner does not reappear if you accepted (app is now standalone) or if you dismissed with ✕ (localStorage flag).
5. Launch the installed app (standalone) → no banner.
6. iOS Safari → no banner (expected; out of scope).
