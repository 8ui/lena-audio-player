# PWA — real icons, iOS meta, GitHub Pages deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Revised after plan-review** (which read Vite's own source). The first draft got two load-bearing mechanisms factually wrong: it used a *relative* `apple-touch-icon` href believing Vite rebases it (it does not — and a missing public asset is silently swallowed, never a build error), and it asserted "BASE_URL always ends in a slash" (Vite guarantees only a *leading* slash). It also hardcoded manifest fields the plugin already derives from `base`, and picked a status-bar style that puts the UI under the iOS clock.

**Goal:** Приложение реально устанавливается на домашний экран iPhone, работает офлайн и живёт по постоянному HTTPS-адресу.

**Architecture:** Сайт публикуется на GitHub Pages в подпуть `/lena-audio-player/`. Это ломает единственный абсолютный URL в коде — `WORKLET_URL` — поэтому он выводится из `import.meta.env.BASE_URL` (закрывает долг «деплой в subpath»). Иконки генерируются детерминированным Node-скриптом без зависимостей (PNG собирается вручную: zlib-deflate + чанки IHDR/IDAT/IEND); рисунок — геометрия самого приложения: тёмный фон, бары волны, красный playhead. iOS-мета — в `index.html`. Деплой — GitHub Actions на пуш в `main`.

## Global Constraints

- **`WORKLET_URL` — load-bearing и невидим в отказе.** Ошибочный путь → `SoundTouchNode.register` реджектится → `load()` бросает → **звука нет вообще**, при этом весь UI рисуется нормально. Единственное доказательство — реальная загрузка трека на задеплоенном сайте.
- **Тесты структурно НЕ МОГУТ поймать регрессию base:** vitest принудительно выставляет `base: '/'` (его плагины `vitest:resolve-root`/`vitest:resolve-core` перетирают конфиг в post-хуке), поэтому под тестами `BASE_URL === '/'` всегда. Зелёный `npm test` тут не значит ничего.
- **Vite гарантирует у `BASE_URL` только ВЕДУЩИЙ слэш, не хвостовой** (`resolveBaseUrl` берёт `new URL(base, …).pathname`). Не полагаться на хвостовой — нормализовать самим.
- **Относительный `href`/`src` на файл из `public/` Vite НЕ ребейзит.** `checkPublicFile` выходит сразу, если URL не начинается с `/`; дальше `processAssetUrl` глотает `ENOENT` и возвращает строку как есть — молча, без предупреждения. Ссылки на `public/`-ассеты в `index.html` пишем с ведущим слэшем.
- `vite.config.ts` **вне tsc-гейта** (CLAUDE.md gotcha #5) — правки валидируются только реальным `vite build`.
- Иконки для iOS **без прозрачности** (iOS сам накладывает маску).
- iOS: у установленной PWA **отдельная IndexedDB** от вкладки Safari. Треки из Safari в установленном приложении не появятся — поведение платформы, не баг.

---

## Task 1: Icon generator + real icons

**Files:**
- Create: `scripts/gen-icons.mjs`
- Replace: `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Create: `public/icons/apple-touch-icon.png` (180×180)

> Zero dependencies: the artwork is only axis-aligned rectangles, so it rasterises
> straight into a pixel buffer and the PNG is assembled by hand. Keeps the icons
> reproducible from source instead of being opaque committed binaries.

- [ ] **Step 1: Write `scripts/gen-icons.mjs`**

```js
// Generates the app icons with zero dependencies.
//
// The artwork is the app itself: dark background, a centred band of waveform
// bars in the app's blue, and the red playhead line down the middle. It is all
// axis-aligned rectangles, so it rasterises directly into a pixel buffer — no
// SVG renderer or image library needed. PNG is then assembled by hand
// (IHDR + IDAT of zlib-deflated scanlines + IEND).
//
// Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [0x12, 0x14, 0x1a];   // app background
const WAVE = [0x5a, 0xa0, 0xff]; // waveform blue
const HEAD = [0xff, 0x5a, 0x5a]; // playhead red

// Fixed, hand-picked bar heights (fraction of the half-height). Deterministic —
// the icon must not change between runs.
const BARS = [
  0.25, 0.45, 0.32, 0.70, 0.52, 0.88, 0.61, 0.96,
  0.55, 0.80, 0.40, 0.66, 0.30, 0.50, 0.22, 0.38,
];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const px = Buffer.alloc(size * size * 3);
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 3;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  };

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, BG);

  const mid = size / 2;
  const pad = Math.round(size * 0.14);
  const span = size - pad * 2;
  const slot = span / BARS.length;
  const barW = Math.max(1, Math.round(slot * 0.55));
  const maxH = size * 0.30;

  BARS.forEach((h, i) => {
    const cx = Math.round(pad + slot * (i + 0.5));
    const half = Math.max(1, Math.round(h * maxH));
    const x0 = cx - Math.floor(barW / 2);
    for (let x = x0; x < x0 + barW; x++) {
      for (let y = Math.round(mid - half); y < Math.round(mid + half); y++) put(x, y, WAVE);
    }
  });

  // Playhead: the fixed red centre line — the core idea of the app.
  const hw = Math.max(1, Math.round(size * 0.016));
  for (let x = Math.round(mid - hw); x < Math.round(mid + hw); x++) {
    for (let y = Math.round(size * 0.16); y < Math.round(size * 0.84); y++) put(x, y, HEAD);
  }

  // Raw scanlines, each prefixed with filter byte 0 (None).
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const o = y * (1 + size * 3);
    raw[o] = 0;
    px.copy(raw, o + 1, y * size * 3, (y + 1) * size * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB, NO alpha (iOS wants opaque)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180], // iPhone @3x; iOS downscales for the other slots
]) {
  writeFileSync(resolve(OUT, name), png(size));
  console.log(`wrote ${name} (${size}x${size})`);
}
```

- [ ] **Step 2: Generate**

Run: `node scripts/gen-icons.mjs`
Expected: three lines; three PNGs in `public/icons/`.

- [ ] **Step 3: Verify they are opaque RGB PNGs of the right size**

Run: `file public/icons/*.png`
Expected: each `PNG image data, <N> x <N>, 8-bit/color RGB, non-interlaced`
(**RGB, not RGBA** — no alpha channel).

---

## Task 2: Subpath — `base` + the load-bearing `WORKLET_URL`

**Files:**
- Modify: `vite.config.ts`, `src/engine/SoundTouchEngine.ts`

> **The one change that can silently kill all audio while everything still
> renders.** And `npm test` cannot catch it: vitest forces `base: '/'`.

- [ ] **Step 1: Set `base` in `vite.config.ts`**

Add as the first option of `defineConfig({...})`:

```ts
  // GitHub Pages serves the repo at /<repo>/, not at the domain root, so every
  // asset URL — JS/CSS, the manifest, the service-worker scope and the
  // AudioWorklet processor — has to respect this.
  base: '/lena-audio-player/',
```

**Do NOT add `start_url`/`scope`/`id` to the manifest.** vite-plugin-pwa already
derives `scope` and `start_url` from `base` (`scope = options.scope || basePath`,
`start_url: basePath`). Hardcoding them only couples the manifest to a literal
that must then be kept in sync with `base` by hand.

Also do **not** "fix" the manifest icon `src`s to absolute paths: they are
relative on purpose and resolve against the manifest's own URL. The plugin does
**not** rebase them.

- [ ] **Step 2: Derive `WORKLET_URL` from the base in `src/engine/SoundTouchEngine.ts`**

Replace:

```ts
const WORKLET_URL = '/soundtouch-processor.js';
```

with:

```ts
// Must respect Vite's base: on GitHub Pages the app is served from
// /lena-audio-player/, where an absolute '/soundtouch-processor.js' 404s —
// SoundTouchNode.register() then rejects, load() throws, and NOTHING plays,
// with no other symptom.
//
// Vite guarantees BASE_URL has a LEADING slash, never a trailing one, so
// normalise it: a `base` written without the trailing slash would otherwise
// yield '/lena-audio-playersoundtouch-processor.js'. And no test can catch that
// — vitest forces base '/' — so this has to be right by construction.
const WORKLET_URL = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}soundtouch-processor.js`;
```

- [ ] **Step 3: Tests still pass (the store imports SoundTouchEngine transitively)**

Run: `npm test`
Expected: all pass. (This proves nothing about the base — see above — it only
proves the module still evaluates.)

- [ ] **Step 4: Build, then verify the subpath and the offline precache**

```bash
npx vite build
grep -o '/lena-audio-player/[^"]*' dist/index.html | sort -u   # JS/CSS/manifest rebased
grep -o '"scope":"[^"]*"' dist/manifest.webmanifest            # -> /lena-audio-player/
grep -c soundtouch-processor dist/sw.js                        # -> >=1, i.e. PRECACHED
```

The last one is the offline acceptance criterion in disguise: if the 72 KB
worklet is not in the precache manifest, the app installs and then plays nothing
in airplane mode.

---

## Task 3: iOS install metadata + safe areas

**Files:**
- Modify: `index.html`, `src/ui/styles.css`

> iOS does **not** read the web manifest's icons for the home screen — it wants
> `<link rel="apple-touch-icon">`, or the installed app gets a screenshot as its
> icon.

- [ ] **Step 1: Add the icon and meta tags inside `<head>` of `index.html`**

```html
    <meta name="theme-color" content="#12141a" />
    <!-- iOS ignores the manifest's icons for the home screen and reads this.
         The leading slash is REQUIRED: Vite only rebases public/ assets whose
         URL starts with '/', and it swallows a miss silently (no build error). -->
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <!-- Standalone (no browser chrome) from the home screen. iOS 16.4+ also
         honours the manifest's display:standalone; the apple- tag covers older
         iOS, the unprefixed one is the standard (Chrome warns on the apple- one). -->
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <!-- 'black', NOT 'black-translucent': index.html already sets
         viewport-fit=cover, and translucent makes the web view go full-bleed —
         the waveform and the error banner would slide under the clock. -->
    <meta name="apple-mobile-web-app-status-bar-style" content="black" />
    <meta name="apple-mobile-web-app-title" content="Разбор" />
```

- [ ] **Step 2: Keep the transport clear of the home indicator — `src/ui/styles.css`**

`viewport-fit=cover` means the bottom of the web view extends under the home
indicator in standalone mode, and `.transport` is `position: sticky; bottom: 0`.

```css
.transport { position: sticky; bottom: 0; display: flex; gap: 12px; align-items: center;
  padding: 12px; background: #181b22;
  /* Standalone on iOS runs full-bleed under the home indicator. */
  padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
```

- [ ] **Step 3: Build and confirm the href WAS rebased**

Run: `npx vite build && grep apple-touch-icon dist/index.html`
Expected: `href="/lena-audio-player/icons/apple-touch-icon.png"`.

If it still reads `/icons/...`, the icon file was missing at build time — Vite
does not error on that, it just leaves the URL alone. Re-run Task 1.

---

## Task 4: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

# Queue deploys; do NOT cancel one in flight — cancelling actions/deploy-pages
# can strand the deployment as permanently "in progress". Queued runs still
# collapse to the latest.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write   # configure-pages reads/enables the Pages site
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22   # vite 8 needs ^20.19 || >=22.12
          cache: npm
      # First, and with enablement: fails fast (and idempotently creates the
      # Pages site) instead of dying confusingly after a full build.
      - uses: actions/configure-pages@v5
        with:
          enablement: true
      - run: npm ci
      # `vite build` uses esbuild and does NOT type-check — gate on both.
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

`configure-pages` with `enablement: true` replaces any manual `gh api` call —
it creates the Pages site if absent and is a no-op if it already exists.

---

## Task 5: Docs, verification, deploy

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Record the subpath rule in `CLAUDE.md` "Gotchas"**

```md
8. **The app is served from a subpath** (`base: '/lena-audio-player/'` — GitHub
   Pages). Any URL to a `public/` asset must be derived from
   `import.meta.env.BASE_URL` (in TS) or start with a leading `/` (in
   `index.html`, so Vite rebases it — a *relative* href is silently NOT rebased,
   and a missing public file is not even a build error). The one that matters is
   `WORKLET_URL` in `SoundTouchEngine.ts`: if it 404s, `SoundTouchNode.register`
   rejects and **no audio plays at all**, while the whole UI still renders fine.
   Note `BASE_URL` is guaranteed a *leading* slash only, never a trailing one —
   normalise it. **The test suite cannot catch a base regression:** vitest forces
   `base: '/'`, so `BASE_URL` is always `'/'` under tests. Only a real
   `vite build` + loading a track on the deployed site proves this works.
```

Also drop the now-closed "deploy in subpath" item from the debt/out-of-scope notes.

- [ ] **Step 2: Full local verification**

Run: `npx tsc --noEmit && npm test && npx vite build`
Expected: type-clean, tests pass, build succeeds.

- [ ] **Step 3: Serve the PRODUCTION build over the tunnel and actually hear audio**

Run these as two background processes (the first blocks):

```bash
npx vite preview --port 4173 &
cloudflared tunnel --url http://localhost:4173
```

On the phone, at `<tunnel-url>/lena-audio-player/`:
- [ ] The app loads (subpath assets resolve).
- [ ] **Import a track and press play — sound actually comes out.** This is the
      real `WORKLET_URL` test. If the worklet 404s, every pixel renders correctly
      and nothing is audible.

- [ ] **Step 4: Push (ask the user first) and let Actions deploy**

```bash
git push origin main
gh run watch
```

- [ ] **Step 5: Install on the phone from the permanent URL**

At `https://8ui.github.io/lena-audio-player/`:
- [ ] Share → «На экран "Домой"» → the icon is the generated waveform, not a screenshot.
- [ ] Launch from the home screen → standalone, no Safari chrome, nothing hidden under the clock or the home indicator.
- [ ] Import a track **inside the installed app** (separate IndexedDB from the Safari tab — platform rule, not a bug) and play it.
- [ ] Airplane mode, relaunch → shell loads and the track still plays.

---

## Self-Review

**Plan-review findings, all folded in:**
- HIGH: relative `apple-touch-icon` href is not rebased by Vite (and a missing public file is silently swallowed) → leading slash + a grep that would actually fail.
- HIGH: `BASE_URL` has no guaranteed trailing slash → normalised in `WORKLET_URL`; and the constraint that **tests structurally cannot catch a base regression** is now stated in the plan *and* written into CLAUDE.md.
- MED: `black-translucent` + `viewport-fit=cover` + no safe-area CSS → UI under the clock → `black` + a bottom safe-area inset on `.transport`.
- MED: nothing verified the worklet is precached (the actual offline criterion) → `grep -c soundtouch-processor dist/sw.js`.
- MED: `cancel-in-progress: true` can strand a Pages deploy → `false`.
- MED: `configure-pages` hard-fails when Pages is not enabled → `enablement: true`, and moved before the build to fail fast; the manual `gh api` step is gone.
- LOW: manifest `id`/`start_url`/`scope` are already derived from `base` → not hardcoded; and the false claim that the plugin rebases icon `src`s is removed.
- LOW: `apple-mobile-web-app-capable` is deprecated in Chrome → emit both tags.
- LOW: `navigateFallback` / SW registration path already correct → nothing added.
- LOW: job-scoped permissions; `vite preview` backgrounded so the tunnel can start.

**Accepted, not done:** no `purpose: 'maskable'` icon — Android would letterbox it in a white circle. This is an iPhone task; note it as debt.

**Placeholder scan:** none — `gen-icons.mjs` is complete and runnable.

**Push note:** `git push` runs only after the user approves.
