import { describe, it, expect } from 'vitest';
import { THEMES, loadThemeName, applyTheme, activePalette, DEFAULT_THEME, type ThemeName, type Palette } from './theme';
import css from './styles.css?raw';
import indexHtml from '../../index.html?raw';

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

  // index.html hardcodes a literal data-theme (see the comment there: it's the
  // static default that colours the very first paint, before applyTheme() runs
  // from main.tsx). Nothing but this assertion stops that literal from drifting
  // away from DEFAULT_THEME if the latter ever changes.
  it("index.html's <html data-theme> matches DEFAULT_THEME", () => {
    const m = /<html\b[^>]*\bdata-theme=["']([^"']+)["']/.exec(indexHtml);
    expect(m, 'index.html <html> tag has no data-theme attribute').not.toBeNull();
    expect(m![1]).toBe(DEFAULT_THEME);
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
