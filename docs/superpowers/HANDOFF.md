# Handoff — Lena Audio Player (пост-ревью → доводка)

**Обновлено:** 2026-07-11
**Статус:** MVP реализован, слит в `main`, **код-ревью пройдено**. Автотесты/типы/сборка зелёные (перепроверено в этой сессии). Ручная проверка на телефоне ещё НЕ выполнена — это главный оставшийся гейт.

## Что это

Мобильная PWA для пианиста: снимать произведения на слух. Замедление/ускорение без изменения тона, транспонирование, A-B луп, крупный движущийся waveform, офлайн-библиотека. Только телефон, portrait.

## Где мы сейчас

- **`main` @ `01a06e0`**, впереди `origin/main` на 21 коммит — **НЕ запушено** (был локальный merge, не PR). Запушить: `git push origin main`.
- Перепроверено в этой сессии: `npm test` → **34/34**, `npx tsc --noEmit` → чисто, `npx vite build` → PWA (`sw.js` + manifest + 10 precache, ~281 KiB). Все три «зелёных» claim подтверждены.
- Код-ревью по всем 5 слоям проведено. Вердикт: **блокеров MVP нет**, все 8 ранее заявленных фиксов — реальные (проверены в коде). Гейт — ручной прогон на устройстве.

## Результаты ревью

### 8 заявленных фиксов — все настоящие

| # | Баг | Фикс |
|---|---|---|
| 1 | onended гонка | `SoundTouchEngine.ts:160` guard по идентичности ноды |
| 2 | load() не сбрасывал playing | `SoundTouchEngine.ts:47` |
| 3 | утечка ноды при replay | `SoundTouchEngine.ts:139` `stopInternal()` в старте source |
| 4 | pan→pinch залипал pause | `WaveformCanvas.tsx:115-124` `wasPlaying` живёт через pan→pinch |
| 5 | degenerate pinch → NaN | `WaveformCanvas.tsx:98` `Math.max(1,dist)` + clamp |
| 6 | persist не флашился на nav | `usePlayerStore.ts:90-96` flush в close/open, cancel в remove |
| 7 | дрейф waveform на 44.1кГц | `WaveformCanvas.tsx:45` `duration/(peaks.length/2)` |
| 8 | zustand v5 без useShallow | `LoopControls.tsx:8`, `TransportBar.tsx:13` |

### Новые находки ревью (НЕ были в follow-ups)

- **M1 (медиум) — тихий фейл декодирования.** `importFile`/`openTrack` (`usePlayerStore.ts:115,131`) не оборачивают `decodeAudioData`. `accept="audio/*"` пускает форматы, которые движок телефона не декодирует (часть m4a, битый файл) → промис реджектится → трек не добавлен/не открыт, юзеру **ничего не показано** (`void importFile(f)` в `Library.tsx:31` глотает реджект). Ломает core-флоу «импорт с телефона» молча. **Рекомендую поднять первой** — единственная находка, бьющая по core-UX. Фикс: try/catch + user-facing ошибка (toast/alert).
- **m2 (минор) — removeTrack рубит чужой pending-write.** `removeTrack` (`usePlayerStore.ts:161`) безусловно `clearTimeout` persist-таймера. Удаление трека Y из библиотеки во время игры X с pending-записью → правка X, сделанная <400мс назад, теряется. Узкий edge.
- **m3 (перф-заметка) — tick() = set() каждый кадр.** `tick` (`usePlayerStore.ts:241`) пишет `position` 60/с → подписчики (TransportBar и др.) ре-рендерятся 60fps. Для MVP ок.

### «DnD на волне не работает» — разобрано, НЕ баг

Жесты слушают только `touchstart/touchmove/touchend` (`WaveformCanvas.tsx:126-128`). На десктопе мышь touch-события не шлёт → drag мышью молчит. На телефоне пальцем — работает. Root cause = отсутствие mouse/pointer-обработчиков, а не поломка пана.
**Опционально (не блокер):** мигрировать жесты на Pointer Events (`pointerdown/move/up`, активные указатели в `Map` для pinch) — тогда drag тестируется и на десктопе, код унифицируется. Полезно для dev-цикла без телефона.

## Следующий этап — план работ (по приоритету)

1. **Ручная проверка на устройстве** (iOS Safari + Android Chrome) — device-чеклист ниже. Единственный гейт MVP.
2. **M1: обработка ошибок декода** — try/catch в `importFile`/`openTrack` + видимая ошибка юзеру.
3. **(опц.) Pointer Events для waveform** — чтобы drag работал/тестировался на десктопе.
4. **Follow-ups (долг, не блокеры)** — см. список ниже, брать пачкой при желании.
5. **`git push origin main`** — когда доводка устроит.

Каждая задача этого этапа проходит через `run-task-pipeline` (проект требует): brainstorm → триаж пресета → impl → review. M1 — тип `bug`, идёт через `systematic-debugging`.

## Device-чеклист (ручная проверка, нельзя закрыть юнит-тестом)

- Импорт аудио → трек в библиотеке.
- Открыть → waveform рисуется, playhead по центру.
- Play → волна едет влево, звук играет; playhead↔звук синхронны.
- Темп 0.5 → полскорости, тон не меняется; скролл волны совпадает.
- Питч −3 → ниже тон, скорость та же.
- Drag волны пальцем → скраб; pinch → зум (20–400); A-B луп → повторяет регион.
- Назад в библиотеку, переоткрыть → темп/питч/луп/позиция восстановлены.
- PWA: `npm run build && npm run preview` → установка на домашний экран; offline после первой загрузки → оболочка грузится, треки из IndexedDB играют; экран не гаснет при воспроизведении.
- Латентность SoundTouch: playhead опережает звук на десятки мс (сильнее на краях диапазона) — оценить, не мешает ли разбору.
- **Импорт неподдерживаемого/битого файла** → сейчас молчит (M1). После фикса — видимая ошибка.

## Follow-ups (долг, подтверждены ревью как реальные)

- **wakeLock:** async request vs sync release гонка при быстром play→pause; нет re-acquire на `visibilitychange` (`App.tsx:15-18`, `pwa/wakeLock.ts`).
- **Луп при B<A:** движок корректно неактивен (`end>start` false), но UI подсвечивает регион и рисует его (`WaveformCanvas.tsx:31`, `LoopControls.tsx:17`) — визуальное рассогласование.
- **`position.ts`:** при `raw<loopStart` playhead замирает на `loopStart` (достижимо через restore с активным лупом); `Math.min(raw,b)` в `position.ts:18` избыточен.
- **`db.ts`:** singleton `dbp` не сбрасывается при reject `openDB` (`db.ts:14`); `deleteTrack` — две транзакции, не атомарно (`db.ts:50-54`).
- **`package.json`:** остатки `npm init` boilerplate (`description`/`main`/`ISC`) + `type:commonjs`; `typescript ^7.0.2` не запинен (lockfile пинит).
- **Деплой в subpath:** абсолютный `WORKLET_URL='/soundtouch-processor.js'` (`SoundTouchEngine.ts:10`) + нет `base` в `vite.config.ts` → сломает деплой не в корень.
- **Интеграционный тест restore-пути** (import→persist→reopen) — долг; `openTrack`/`importFile` не гоняются в jsdom (нет AudioContext).

## Ключевые решения (зафиксированы)

- **Источник аудио:** только локальные файлы с телефона. Без бэкенда, без YouTube.
- **Движок:** `@soundtouchjs/audio-worklet` за интерфейсом `AudioEngine`. Rubberband — будущая замена, вне MVP.
  - Темп = `playbackRate` на source И на node (оба одновременно). Питч = `pitchSemitones`.
  - A-B луп = нативные `source.loop/loopStart/loopEnd`.
  - Позиция считается формулой (`currentSourceTime`, чистая), НЕ репортится из worklet. Конец трека ловит `source.onended` — guard по идентичности ноды, НЕ boolean-флагом.
- **Waveform:** кастомный canvas. Playhead фиксирован по центру, волна движется. 1 палец = пан/seek, 2 пальца = pinch-зум (20–400 px/с). `secondsPerBucket = duration/(peaks.length/2)`.
- **Хранилище:** IndexedDB через `idb`. Записи дебаунсятся 400мс; флашатся при уходе с трека (`closeTrack`/`openTrack`).
- **Стек:** Vite 8 + React 19 + TS 7 (tsgo) + zustand 5 + idb + vite-plugin-pwa; Vitest 4 + fake-indexeddb + RTL.
- **Вне MVP:** маркеры UI, мини-карта, Rubberband. Поля маркеров в схеме — schema-only.

## Архитектура (5 слоёв) → файлы

```
UI (React)            → src/screens/{Library,Player}.tsx, src/ui/{TransportBar,TempoControl,PitchControl,LoopControls}.tsx, src/App.tsx
  ↓
Store (Zustand)       → src/store/usePlayerStore.ts   (мост engine↔UI↔db; import/open/persist/tick)
  ↓
AudioEngine (интерф.) → src/engine/AudioEngine.ts
  ↓
SoundTouchEngine      → src/engine/SoundTouchEngine.ts (Web Audio; + src/engine/{params,position}.ts чистые)
Waveform (canvas)     → src/waveform/{WaveformCanvas.tsx, viewport.ts, computePeaks.ts}
Storage (IndexedDB)   → src/storage/db.ts, src/types.ts
PWA shell + wake lock → vite.config.ts (VitePWA), src/pwa/wakeLock.ts, public/{soundtouch-processor.js,icons/}
```

## Проверки локально

```bash
npm ci
npm test              # 34/34
npx tsc --noEmit      # чисто
npx vite build        # sw + manifest + иконки
npm run dev -- --host # ручная проверка (см. device-чеклист)
```

## Коммиты по задачам

| Задача | Коммит(ы) |
|---|---|
| 1 Scaffold | `d7c23ee` |
| 2 Engine params | `391ae9c` |
| 3 Position+loop math | `6d643bf` |
| 4 Viewport math | `6db4c3a` |
| 5 computePeaks | `ff0b75c` |
| 6 Storage IndexedDB | `24ccbf2` |
| 7 SoundTouchEngine | `3a587cb` + фикс `d66b9e2` |
| 8 Player store | `a287972` |
| 9 WaveformCanvas | `3a836fa` + фикс `748e076` |
| 10 Controls | `9e4206e` |
| 11 Library | `189fe32` |
| 12 Player+routing | `31a5fc7` |
| 13 PWA + wake lock | `cfb7e83` |
| 14 CLAUDE.md | `c7e3bf0` + фикс `b7ed54c` |
| Финальный fix-wave | `a2af183` + тест `1d51c37` |
| Warning-баннеры в план | `01a06e0` |

## Артефакты процесса

Ledger + пер-задачные отчёты implementer/reviewer — локально в `.superpowers/sdd/` (gitignored): `progress.md`, `task-N-report.md`, `final-fix-report.md`, `review-*.diff`. Спека — `docs/superpowers/specs/2026-07-10-audio-player-design.md`, план — `docs/superpowers/plans/2026-07-10-audio-player-mvp.md`.

## CLAUDE.md

В корне репо. Архитектура + раздел «Gotchas» (zustand v5 useShallow, source-identity guard для onended, jsdom-стаб AudioWorkletNode, vite-env.d.ts, vite.config.ts вне tsc-гейта, persist debounce 400мс, мажоры тулчейна). Актуален, выверен по коду.
