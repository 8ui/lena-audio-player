/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the repo at /<repo>/, not at the domain root, so every
// asset URL — JS/CSS, the manifest, the service-worker scope and the
// AudioWorklet processor — has to respect this.
//
// Vite only guarantees BASE_URL a LEADING slash, never a trailing one. Without
// the trailing slash, `${BASE_URL}soundtouch-processor.js` in SoundTouchEngine
// becomes '/lena-audio-playersoundtouch-processor.js' → the worklet 404s →
// SoundTouchNode.register() rejects → NO AUDIO PLAYS AT ALL, while the whole UI
// still renders perfectly. Neither tsc (this file is outside the tsc gate) nor
// the test suite (vitest forces base '/') can see that. So assert it here, where
// a mistake is a loud build failure instead of a silently mute production app.
const BASE = '/lena-audio-player/';
if (!BASE.startsWith('/') || !BASE.endsWith('/')) {
  throw new Error(`base must start AND end with a slash; got ${JSON.stringify(BASE)}`);
}

export default defineConfig({
  // Do NOT hardcode start_url/scope/id in the manifest below: vite-plugin-pwa
  // already derives them from `base`. And do not "fix" the manifest icon srcs to
  // absolute paths — they are relative on purpose and resolve against the
  // manifest's own URL; the plugin does not rebase them.
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Разбор',
        short_name: 'Разбор',
        lang: 'ru',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#12141a',
        theme_color: '#12141a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'] },
    }),
  ],
  // Device testing runs the app on a phone through a cloudflared quick tunnel,
  // which serves it from a *.trycloudflare.com host over trusted HTTPS. Vite
  // rejects unknown Host headers with a 403, so allow that suffix. HTTPS is not
  // a nicety here: service workers, PWA install and navigator.wakeLock are all
  // secure-context gated, and a plain-HTTP LAN origin silently disables them
  // (it also hid crypto.randomUUID — see src/uuid.ts).
  server: { allowedHosts: ['.trycloudflare.com'] },
  preview: { allowedHosts: ['.trycloudflare.com'] },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
