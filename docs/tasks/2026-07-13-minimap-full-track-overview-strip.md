---
id: 2026-07-13-minimap-full-track-overview-strip
title: "MiniMap: full-track overview strip"
type: feature
pipeline: no-spec
phase: done
created: 2026-07-13
updated: 2026-07-13
blocked_by: null
artifacts:
  spec: null
  plan: docs/superpowers/plans/2026-07-13-minimap.md
  branch: null
  pr: null
---

## Context

Этап-2 фича #2: мини-карта — тонкий (48px) обзорный стрип под основной волной. Показывает ВСЮ дорожку: волна, playhead, A-B луп, маркеры. Тап/драг = seek (пауза на драг, resume на отпускании — как pan). Ключ: full-track пики огромны (200 бакетов/с), поэтому статичная волна кешируется в offscreen-canvas и блитится каждый кадр, а не пересчитывается. Пур-фн: `downsamplePeaks` (computePeaks.ts), `overviewTimeToX`/`overviewXToTime` (viewport.ts). Дальше — #3 Rubberband.

## Log

- 2026-07-13: triage — pipeline `no-spec`, reason: Feature, ~5 files (computePeaks+viewport pure fns & tests, new MiniMap.tsx, Player, styles). Known arch, follows WaveformCanvas rAF+touch pattern. Perf-critical: offscreen cache for static waveform.
- 2026-07-13: plan drafted: docs/superpowers/plans/2026-07-13-minimap.md (4 tasks: downsamplePeaks, overview math, MiniMap canvas+gestures, mount+styles)
- 2026-07-13: plan-review passed (Plan/opus, 10 findings incl 1 HIGH gesture dead-lock). Plan rewritten: identifier-tracked touch, array-cache instead of offscreen canvas, exact downsample tests, dirty-check, dpr rounding fix (both canvases), markers drawn last, deferred pause, CLAUDE.md refresh.
- 2026-07-13: impl complete: 4 tasks (downsamplePeaks 5t, overview math 4t, MiniMap canvas+gestures, mount+dpr fix+CLAUDE.md). 62/62 (+9), tsc clean, build OK.
- 2026-07-13: review passed (high, 2 low): dpr-in-dirty-check FIXED; unmount-mid-drag -> debt. 62/62, tsc clean, build OK. Committing.

## Decisions

_Нетривиальные решения по ходу задачи. Одна строка на решение._

## Debt

- [ ] MiniMap: размонтаж посреди drag не резюмит воспроизведение (cleanup только снимает листенеры). Практически недостижимо — closeTrack/removeTrack и так делают engine.pause().

## Blockers

_Текущие блокеры. Очистить, когда разрешены._
