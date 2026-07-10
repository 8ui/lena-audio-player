# Handoff — Lena Audio Player

**Обновлено:** 2026-07-10
**Статус:** дизайн + план готовы и закоммичены. Кода приложения ещё нет. Следующий шаг — реализация Task 1.

## Что это

Мобильная PWA для пианиста: снимать произведения на слух. Замедление/ускорение без изменения тона, транспонирование, A-B луп, крупный движущийся waveform, офлайн-библиотека. Только телефон.

## Документы (читать в этом порядке)

1. **Спек:** [specs/2026-07-10-audio-player-design.md](specs/2026-07-10-audio-player-design.md) — что и почему.
2. **План:** [plans/2026-07-10-audio-player-mvp.md](plans/2026-07-10-audio-player-mvp.md) — 14 задач, TDD, пошагово с кодом. Это источник истины для реализации.

## Ключевые решения (зафиксированы)

- **Источник аудио:** только локальные файлы с телефона. Без бэкенда, без YouTube.
- **Движок:** `@soundtouchjs/audio-worklet` за интерфейсом `AudioEngine`. Rubberband — будущая замена, вне MVP.
  - Темп = `playbackRate` на source И на node (оба одновременно). Питч = `pitchSemitones`.
  - A-B луп = нативные `source.loop/loopStart/loopEnd`.
  - Позиция считается формулой (`currentSourceTime`), НЕ репортится из worklet. Конец трека ловит `source.onended`.
- **Waveform:** кастомный canvas, НЕ wavesurfer. Модель: playhead фиксирован по центру, волна движется. Окно по умолчанию ~10с. 1 палец = пан/seek, 2 пальца = pinch-зум (20–400 px/с).
- **Хранилище:** IndexedDB через `idb`. Треки (blob+peaks) + trackState (темп/питч/луп/pxPerSec/маркеры/позиция). Записи дебаунсятся 400мс.
- **Стек:** Vite + React + TS + PWA (vite-plugin-pwa), Zustand, Vitest + fake-indexeddb + RTL.
- **Тач:** всё ≥ 44×44px (`--touch: 48px`).
- **Вне MVP:** маркеры UI, мини-карта, Rubberband. Поля маркеров в схеме уже есть.

## Архитектура (5 слоёв)

```
UI (React) → Store (Zustand) → AudioEngine (интерфейс) → SoundTouchEngine (Web Audio)
                  ├→ Waveform (canvas)
                  └→ Storage (IndexedDB)
       PWA shell (manifest + service worker)
```

Чистая математика (позиция/луп, вьюпорт, пики, clamp параметров, storage) — тест-первый (Tasks 2–6, 8). Императивный движок и canvas (Tasks 7, 9) — сборка + ручная проверка на телефоне.

## Состояние git

Ветка `main`. Коммиты:
```
f39a93e docs: plan-review fixes
8a09f02 docs: MVP implementation plan (14 tasks, TDD)
96eb2ce docs: moving zoomed waveform + touch-first UI in spec
6b1ef82 docs: design spec for mobile transcription audio player
```
`node_modules/`, `dist/` в .gitignore. Приложения (`src/`, `package.json`) пока нет.

## Plan-review — уже применённые фиксы

План отревьюен, 4 бага исправлены (в коммите f39a93e):
1. `setTempo` — порядок ре-анкора позиции (иначе скачок playhead).
2. `getCurrentTime` — чистый, без рекурсии.
3. `persist()` — дебаунс (иначе спам IDB).
4. Стор-тест — `ensureEngine()` + починен `fakeEngine`.

Известные ограничения (задокументированы в Task 7): латентность SoundTouch (playhead опережает звук), фолбэк типов `SoundTouchNode`.

## Следующий шаг

Режим выполнения НЕ выбран (ждали ответа пользователя):
- **Subagent-Driven (реком.):** `superpowers:subagent-driven-development` — свежий субагент на задачу, ревью между.
- **Inline:** `superpowers:executing-plans` — батчами с чекпоинтами.

После выбора — начать с **Task 1** (каркас Vite+React+TS+Vitest). Каждая задача заканчивается независимо тестируемым результатом и коммитом.

## Проверки, которые нельзя делать юнит-тестом

Требуют реального телефона (iOS Safari + Android Chrome): качество замедления/питча, латентность, синхрон playhead↔звук, жесты waveform, батарея, offline-запуск PWA, установка на домашний экран. См. чеклист в Task 12 Step 4 и Task 13 Step 5.

## CLAUDE.md

Создаётся в Task 14 — ПОСЛЕ появления реальной структуры кода, чтобы описывать факт, а не план.
