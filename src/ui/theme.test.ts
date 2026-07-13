import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEMES, loadThemeName, applyTheme, activePalette, type ThemeName, type Palette } from './theme';

// 'node:fs' has no ambient type here without a project @types/node dependency
// — see the minimal shim in src/vite-env.d.ts.

// NB: `import.meta.url` is pulled into a variable before being passed to
// `new URL(...)`. Vite statically special-cases the literal expression
// `new URL('./x', import.meta.url)` as its browser asset-URL pattern and
// rewrites `import.meta.url` to `'' + self.location` under the jsdom test
// environment (this file also needs jsdom, for `document`/`localStorage`
// below, so forcing a plain-node test environment for the whole file is not
// an option). That rewrite makes `new URL(...)` produce a non-`file:` URL,
// and `readFileSync` throws "The URL must be of scheme file". Breaking the
// literal pattern here sidesteps the rewrite; the resolved path and the
// test's assertions are unchanged.
const here = import.meta.url;
const css = readFileSync(new URL('./styles.css', here), 'utf8');

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
