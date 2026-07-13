/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
