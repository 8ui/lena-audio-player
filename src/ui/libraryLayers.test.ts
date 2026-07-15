import { describe, it, expect } from 'vitest';
import css from './styles.css?raw';

// Same trick as ControlTabs.test.tsx: read the stylesheet, because jsdom does
// not hit-test stacking contexts (RTL dispatches events straight at the node),
// so a backdrop silently covering a button is invisible to every other test.
function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.]/g, '\\.');
  const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`styles.css has no ${selector} rule`);
  return m[1];
}

function cssProp(block: string, prop: string): string | undefined {
  return new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+);`).exec(block)?.[1].trim();
}

describe('library layer order', () => {
  // The INVERSE of the player's dock, where every row deliberately clears
  // .backdrop. Here the sheet's backdrop must cover the header and the FAB: with
  // a sheet open, a tap on ＋ must close the sheet, NOT open the file picker,
  // and a tap on the theme swatch must not switch the palette.
  it.each(['.library-header', '.import-fab'])(
    'keeps %s BELOW the sheet backdrop',
    (selector) => {
      const row = cssBlock(selector);
      const backdrop = cssBlock('.sheet-backdrop');

      const rowPosition = cssProp(row, 'position');
      expect(rowPosition, `${selector} must be positioned for z-index to apply`).toBeTruthy();
      expect(rowPosition).not.toBe('static');

      const rowZ = Number(cssProp(row, 'z-index'));
      const backdropZ = Number(cssProp(backdrop, 'z-index'));
      expect(Number.isNaN(rowZ), `${selector} must declare a z-index`).toBe(false);
      expect(rowZ).toBeLessThan(backdropZ);
    },
  );

  it('keeps the sheet itself above its own backdrop', () => {
    const sheetZ = Number(cssProp(cssBlock('.sheet'), 'z-index'));
    const backdropZ = Number(cssProp(cssBlock('.sheet-backdrop'), 'z-index'));
    expect(sheetZ).toBeGreaterThan(backdropZ);
  });

  // The MVP classes. If any of them comes back, something is rendering the old
  // screen.
  it.each(['.screen-header', '.control-row', '.library-item'])(
    'has no leftover MVP rule %s',
    (selector) => {
      expect(() => cssBlock(selector)).toThrow();
    },
  );
});
