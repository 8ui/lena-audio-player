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
