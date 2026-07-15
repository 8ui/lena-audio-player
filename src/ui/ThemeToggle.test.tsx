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
