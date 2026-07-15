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
