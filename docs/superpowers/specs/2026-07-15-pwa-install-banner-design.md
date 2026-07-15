# PWA Install Banner — Design

**Date:** 2026-07-15
**Status:** Approved (design)

## Goal

When a user opens "Разбор" in a browser (not yet installed), invite them to
install the PWA via a dismissible banner at the bottom of the screen.

## Scope decisions

- **Form:** dismissible bottom banner with an "Установить" button and a ✕ close
  button.
- **Platforms:** Chrome / Android / Edge only — i.e. wherever the
  `beforeinstallprompt` event fires. iOS Safari is explicitly out of scope
  (no `beforeinstallprompt`, no custom "Add to Home Screen" instructions in
  this iteration).
- **Timing:** show on first eligible visit, as soon as the browser fires
  `beforeinstallprompt` (the browser controls that via its own engagement
  heuristics). No app-side engagement gate.
- **Dismissal is remembered** in `localStorage` so the banner does not nag on
  every visit.

## Non-goals (YAGNI)

- No iOS instruction hint.
- No persistent "Install" button in the header.
- No re-prompt scheduling / cooldown beyond a single boolean dismissal flag.
- No analytics on accept/dismiss.

## Architecture

Follows the project's layering: PWA/browser concerns live next to
`src/pwa/wakeLock.ts`, not in the Zustand store. Logic is pushed out of the
component into a module with one pure, unit-tested function; the component is a
thin DOM/React adapter (same rule the minimap gesture reducer follows).

### `src/pwa/installPrompt.ts` (new)

Imperative glue + one pure function.

- **Module load:** registers a `beforeinstallprompt` listener immediately. The
  event can fire before React mounts, so this module is imported for its
  side effect early in `main.tsx`. The handler calls `preventDefault()`, stashes
  the event in a module variable, and notifies subscribers.
- Registers an `appinstalled` listener that clears the stashed event (banner
  disappears once installed).
- `subscribe(cb: () => void): () => void` and `getSnapshot(): InstallState` —
  shaped for React's `useSyncExternalStore`. `InstallState` carries at least
  `{ canInstall: boolean; dismissed: boolean }`.
- `promptInstall(): Promise<void>` — calls the stashed event's `prompt()`,
  awaits `userChoice`, then clears the event and notifies (a used
  `beforeinstallprompt` event cannot be prompted twice).
- `dismiss(): void` — writes `localStorage['razbor.installDismissed'] = '1'` and
  notifies.
- `isStandalone(): boolean` — `matchMedia('(display-mode: standalone)').matches`
  OR `navigator.standalone` (iOS). Used to suppress the banner when already
  running installed.
- **Pure:** `shouldShowInstallBanner({ canInstall, standalone, dismissed }):
  boolean` → `canInstall && !standalone && !dismissed`. This is the unit-tested
  surface.

### `src/ui/InstallBanner.tsx` (new)

- Reads the module via `useSyncExternalStore(subscribe, getSnapshot)`.
- Computes `shouldShowInstallBanner({ canInstall, standalone: isStandalone(),
  dismissed })`; renders nothing when false.
- When visible: a fixed bottom banner. "Установить" → `promptInstall()`; ✕ →
  `dismiss()`.
- All colours come from CSS variables (`.install-banner` class in
  `styles.css`) — no hardcoded hex, so a theme switch recolours it for free.

### Wiring

- `src/main.tsx` — add `import './pwa/installPrompt';` early (before
  `createRoot(...).render(...)`) so the `beforeinstallprompt` listener is
  attached at page load.
- `src/screens/Library.tsx` — render `<InstallBanner />`. The banner lives on
  the Library screen (the browser entry point), which keeps it clear of the
  Player's bottom `PlayerDock`.

## Layout / theming

- `.install-banner`: `position: fixed`, anchored to the bottom, full width,
  `z-index` above page content, `padding-bottom: env(safe-area-inset-bottom)`
  (standalone full-bleed inset, matching the error banner and dock).
- Colours via CSS variables under `:root[data-theme='warm'|'studio']` only.
  No palette read, no redraw on theme change (it is DOM, not canvas).
- **FAB collision:** `.import-fab` is `position: fixed`, bottom-right,
  `z-index: 30`. While the banner is visible it would overlap. Resolution: lift
  the FAB above the banner while the banner shows — via a modifier class on the
  Library root (e.g. `.has-install-banner .import-fab { bottom: <banner
  height + gap> }`) or an equivalent offset. Exact mechanism decided in the
  implementation plan. The banner keeps its bottom anchor; the FAB moves, not
  the banner.

## Testing

- **Unit — `src/pwa/installPrompt.test.ts`:** the pure
  `shouldShowInstallBanner` across the canInstall × standalone × dismissed
  matrix.
- **RTL — `src/ui/InstallBanner.test.tsx`:** mock the `installPrompt` module;
  assert the banner shows/hides per state, that clicking "Установить" calls
  `promptInstall`, and that ✕ calls `dismiss`. Patterned on `App.test.tsx` /
  `dock.test.tsx`.
- **Device-only (documented, not covered by tests):** jsdom does not fire
  `beforeinstallprompt`, so the imperative capture, `event.prompt()`,
  `appinstalled`, and real installation are manual device checks — same status
  as the engine and canvases. Note this in CLAUDE.md's "what tests
  structurally cannot cover" list.

## Risks / notes

- `beforeinstallprompt` firing is browser-controlled; on a first-ever visit the
  browser may not fire it until its engagement heuristics are met, so "sudden
  first visit" can mean "as soon as the event arrives", not literally the first
  paint. Acceptable — no app-side workaround.
- Secure context required: install (and the event) only work over HTTPS /
  localhost — already true for the deployed site and the cloudflared tunnel.
