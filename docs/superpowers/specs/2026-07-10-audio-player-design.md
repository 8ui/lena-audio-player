# Дизайн: мобильный плеер для снятия произведений

**Дата:** 2026-07-10
**Статус:** утверждён (брейншторм)

## Цель

Веб-приложение (мобильная PWA) для пианиста, снимающего произведения на слух.
Позволяет замедлять/ускорять запись без изменения высоты, транспонировать,
зацикливать трудный фрагмент (A-B луп) и видеть волновую форму для точной
навигации. Только мобильные устройства. Работает офлайн.

## Ключевые решения

| Решение | Выбор | Почему |
|---|---|---|
| Источник аудио | Локальные файлы с телефона | Просто, офлайн, без бэкенда и копирайт-рисков |
| Движок темпа/питча | SoundTouchJS через AudioWorklet | Чистый TS, независимые time-stretch и pitch, дёшев по CPU/батарее |
| Waveform | Кастомный canvas (не wavesurfer) | wavesurfer конфликтует со своим playback; нам нужен полный контроль |
| Сохранение | IndexedDB (`idb`), офлайн | Треки + маркеры + настройки, полностью локально |
| UI-стек | React + Vite + TS + PWA (vite-plugin-pwa) | Стандарт, готовые компоненты, лёгкая PWA-сборка |
| Состояние | Zustand | Минимальный мост engine ↔ UI |

Отвергнуто: нативный `playbackRate + preservesPitch` — не умеет транспонировать.
Rubberband WASM — отложен как вторая реализация того же интерфейса (лучше
качество, но тяжелее и рискованнее по батарее на мобилке).

## Объём

### MVP (эта итерация)
- Библиотека сохранённых треков (импорт, открытие, удаление)
- Waveform + seek/скраб
- A-B луп (set A / set B / clear / toggle)
- Замедление/ускорение 0.25x–1.5x без изменения тона
- Транспонирование −12…+12 полутонов
- Полное сохранение состояния в IndexedDB, офлайн (PWA)

### Этап 2 (после MVP)
- Маркеры (закладки на части: куплет/припев)
- Pinch-zoom волновой формы для точной расстановки A/B и маркеров
- (Опционально позже) движок Rubberband для максимального качества

## Архитектура

Пять слоёв, движок отделён от UI за интерфейсом:

```
UI (React, mobile) ──► Store (Zustand) ──► AudioEngine (интерфейс)
                            │                    └─► SoundTouchEngine (Web Audio + AudioWorklet)
                            ├──► Waveform (canvas)
                            └──► Storage (IndexedDB via idb)
        PWA shell (vite-plugin-pwa: manifest + service worker)
```

### 1. Audio Engine (`src/engine/`)

Framework-agnostic TS. Интерфейс:

```ts
interface AudioEngine {
  load(buffer: AudioBuffer): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;      // позиция в ИСХОДНОМ треке
  setTempo(rate: number): void;     // 0.25..1.5
  setPitchSemitones(n: number): void; // -12..12
  setLoop(a: number | null, b: number | null): void;
  readonly currentTime: number;     // источник-позиция, маппится на waveform
  readonly duration: number;
  onTimeUpdate: (t: number) => void;
  onEnded: () => void;
}
```

Реализация `SoundTouchEngine`: граф Web Audio
`source → SoundTouch AudioWorklet (темп+питч) → GainNode → destination`.
Worklet держит курсор чтения по исходным сэмплам, применяет tempo (rate) и
pitch (semitones→ratio), на границе B прыгает к A (луп), периодически шлёт
позицию в главный поток через `port.postMessage`.

**Важно:** при time-stretch «текущее время» = позиция в исходном треке (то, что
маппится на waveform), а не wall-clock — темп плавает.

### 2. Waveform (`src/waveform/`)

- `computePeaks(buffer, buckets)` → массив min/max (Float32). Считается один раз
  при импорте, кэшируется в IndexedDB (пересчёт дорог на мобилке).
- `WaveformCanvas` (React): рисует пики + playhead + зону A-B + (этап 2) метки.
  Тач: скраб/seek, драг ручек A/B. Playhead обновляется в rAF-цикле от
  `engine.currentTime`. Pinch-zoom — этап 2.

### 3. Storage (`src/storage/`)

IndexedDB через `idb`. Стор `tracks`:
`{ id, name, blob, peaks: Float32Array, duration, createdAt }`.
Стор `trackState`:
`{ trackId, tempo, pitch, loopA, loopB, markers: [], lastPosition }`.
Записи настроек дебаунсятся. Маркеры в схеме есть с MVP (пустой массив), UI для
них — этап 2.

### 4. Store (`src/store/`)

Zustand. Хранит: список библиотеки, текущий трек, состояние воспроизведения
(isPlaying, tempo, pitch, loopA/B, position). Мост engine ↔ UI. Дебаунс-персист
в IndexedDB при смене настроек.

### 5. UI (`src/screens/`, `src/ui/`)

Два экрана:

- **Библиотека:** список сохранённых треков (имя, длительность), кнопка
  «＋ Импорт» (file picker `accept="audio/*"`), тап — открыть, long-press —
  удалить.
- **Плеер:** waveform сверху; транспорт снизу под большой палец (play/pause,
  ±5с, текущее/общее время); панель контролов: слайдер темпа (0.25–1.5x) +
  reset, степпер питча (−12…+12 полутонов) + reset, A-B (set A / set B / clear /
  toggle loop).

### 6. PWA shell

`vite-plugin-pwa`: manifest (name, иконки, `display: standalone`, portrait),
service worker precache оболочки. Аудио в IndexedDB → полностью офлайн.
Screen Wake Lock во время игры. iOS: разблокировка `AudioContext` по первому
жесту пользователя.

## Потоки данных

- **Импорт:** File → `decodeAudioData` → `computePeaks` → сохранить blob+peaks →
  добавить в библиотеку.
- **Открытие:** blob → decode → `engine.load` → рисуем waveform из кэша пиков →
  восстанавливаем темп/питч/луп/позицию из `trackState`.
- **Воспроизведение:** worklet двигает источник-позицию → шлёт её → rAF обновляет
  playhead и время. Луп: worklet заворачивает на границе B→A.
- **Настройка:** UI → store → `engine.setX` + дебаунс-запись в IndexedDB.

## Обработка ошибок

- Битый/неподдерживаемый файл: `decodeAudioData` reject → тост «не удалось
  прочитать файл», не добавляем.
- Переполнение квоты IndexedDB: catch → предупреждение, предложить удалить старые
  треки.
- iOS `AudioContext` suspended: resume по первому тапу; состояние «нажми play».
- Нет поддержки AudioWorklet (очень старый браузер): feature-detect →
  сообщение. Современные мобильные браузеры — ок.
- Долгий `computePeaks` на больших файлах: считать чанками с индикатором
  прогресса, чтобы не блокировать UI.

## Тестирование

- **Unit:** математика позиции/лупа (wrap B→A), semitone→ratio, `computePeaks`
  (детерминированно на известном буфере), storage CRUD (fake-indexeddb).
- **Компоненты:** контролы меняют store (React Testing Library) — слайдер темпа,
  A-B кнопки.
- **Ручное (обязательно):** реальные iOS Safari и Android Chrome — качество
  звука, латентность, батарея юнит-тестами не проверяются.

## Открытые вопросы

Нет блокирующих. Диапазоны (темп 0.25–1.5x, питч ±12) — стартовые, легко
подстроить после тестов на устройстве.
