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
