// Single source of truth for colour. The DOM reads these values as CSS
// variables (styles.css), the canvases import them directly — theme.test.ts
// pins the two files to the same numbers.
export type ThemeName = 'warm' | 'studio';

export interface Palette {
  bg: string;
  surface: string;
  elevated: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  playhead: string;
  loopFill: string;
  marker: string;
  canvasBg: string;
  minimapPeaks: string;
}

// Canvas colours carry meaning: accent = the data (waveform peaks),
// playhead = "now", marker = a marker. Keep those roles when adding a theme.
export const THEMES: Record<ThemeName, Palette> = {
  warm: {
    bg: '#17150f',
    surface: '#1e1b14',
    elevated: '#241f18',
    border: '#2b2720',
    text: '#f2ece0',
    muted: '#a09582',
    accent: '#ffb43f',
    onAccent: '#231a08',
    playhead: '#ff5a5a',
    loopFill: 'rgba(255,180,63,0.14)',
    marker: '#8be0ff',
    canvasBg: '#100f0b',
    minimapPeaks: '#8a6a30',
  },
  studio: {
    bg: '#12141a',
    surface: '#181b22',
    elevated: '#2a2e3a',
    border: '#23262f',
    text: '#eeeeee',
    muted: '#8b93a7',
    accent: '#5aa0ff',
    onAccent: '#08111f',
    playhead: '#ff5a5a',
    loopFill: 'rgba(90,160,255,0.18)',
    marker: '#ffcf5a',
    canvasBg: '#0c0e12',
    minimapPeaks: '#3f6ea8',
  },
};

export const DEFAULT_THEME: ThemeName = 'warm';

const STORAGE_KEY = 'razbor.theme';

export function loadThemeName(): ThemeName {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'warm' || v === 'studio' ? v : DEFAULT_THEME;
  } catch {
    // Safari private mode can throw on localStorage access.
    return DEFAULT_THEME;
  }
}

export function applyTheme(name: ThemeName = loadThemeName()): void {
  document.documentElement.dataset.theme = name;
}

// Called by both canvases once per drawn frame: a single dataset read, and it
// means a theme change needs no subscription — the canvases already redraw.
export function activePalette(): Palette {
  return THEMES[document.documentElement.dataset.theme === 'studio' ? 'studio' : 'warm'];
}
