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
