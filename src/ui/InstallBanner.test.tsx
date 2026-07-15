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
