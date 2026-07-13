---
id: 2026-07-12-markers-bookmarks-on-waveform
title: "Markers: bookmarks on waveform"
type: feature
pipeline: no-spec
phase: done
created: 2026-07-12
updated: 2026-07-13
blocked_by: null
artifacts:
  spec: null
  plan: docs/superpowers/plans/2026-07-12-markers.md
  branch: null
  pr: null
---

## Context

Этап-2 фича #1: именованные закладки (маркеры) на движущейся волне. Кнопка «＋ маркер» ставит на playhead, авто-номера 1..N по времени, ◀/▶ навигация (seek), «− маркер» убирает ближайший в пределах 1с. Схема `Marker` уже в types.ts; `persistNow` сейчас пишет `[]`. Пур-логика в новом `src/waveform/markers.ts` (TDD), стор-экшены тонкие, тики рисуются в rAF WaveformCanvas, UI = MarkersControl по паттерну LoopControls. После маркеров идут #2 мини-карта, #3 Rubberband.

## Log

- 2026-07-12: triage — pipeline `no-spec`, reason: Feature, ~5 files (store+WaveformCanvas+new MarkersControl+Player+styles), known arch following loop-controls pattern. Real logic: sort/relabel/nearest/prev-next/persist. no-spec fits.
- 2026-07-12: plan drafted: docs/superpowers/plans/2026-07-12-markers.md (4 tasks: pure markers module, store integration, MarkersControl+Player, waveform ticks)
- 2026-07-12: plan-review passed (Plan/opus): no critical; M1 dup-line -> plan clarified (edit both sites), L2 -> draw ticks after playhead, L3 persist-test gap -> debt.
- 2026-07-13: impl complete: 4 tasks (markers module 7t, store 5t, MarkersControl 2t, canvas ticks). 53/53 tests (+14), tsc clean, build OK.
- 2026-07-13: review passed (high, 3 low): #2 no-op persist FIXED (guard), #3 double-get FIXED, #1 dedup -> debt. 53/53, tsc clean. Awaiting user commit approval.
- 2026-07-13: committed to main. 53/53, tsc clean, build OK.

## Decisions

_Нетривиальные решения по ходу задачи. Одна строка на решение._

## Debt

- [ ] persist→restore маркеров без автотеста (openTrack/importFile не гоняются в jsdom — нет AudioContext); проверяется вручную. Консистентно с политикой persist/canvas.
- [ ] addMarker не дедуплицирует: повторные тапы на одной позиции дают накладывающиеся маркеры (usePlayerStore.ts addMarker). UX-косметика; min-gap порог — отдельное дизайн-решение.

## Blockers

_Текущие блокеры. Очистить, когда разрешены._
