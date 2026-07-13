---
id: 2026-07-13-relative-minimap-scrub-kill-ios-long-press-callout
title: Relative minimap scrub + kill iOS long-press callout
type: bug
pipeline: no-spec
phase: done
created: 2026-07-13
updated: 2026-07-13
blocked_by: null
artifacts:
  spec: null
  plan: null
  branch: null
  pr: null
---

## Context

_2-5 строк: что делаем и зачем. Задача этой секции — чтобы через N дней можно было восстановить контекст без чтения spec/plan._

## Log

- 2026-07-13: triage — pipeline `no-spec`, reason: Device bugs (iOS): minimap jumps to tap (loses your place) -> needs relative scrub; long-press shows context callout + selection highlight. 4 files (viewport pure fn + test, MiniMap gestures, styles.css). Gesture code — plan-review caught a HIGH dead-lock here last time.
- 2026-07-13: plan drafted: docs/superpowers/plans/2026-07-13-relative-scrub.md (3 tasks: overviewDragToTime pure, MiniMap anchored relative gestures, CSS touch-callout kill)
- 2026-07-13: plan-review passed (Plan/opus): 2 HIGH (stale wasPlaying across natural end; no slop threshold -> tap != no-op), MED (relative mapper falling back to 0 yanks to track start; WaveformCanvas counts global e.touches -> false pinch + no touchcancel). Plan rewritten: gesture state machine extracted to PURE REDUCER (2nd rewrite, both had HIGH bugs -> move onto TDD surface).
- 2026-07-13: impl complete: CSS callout kill, overviewDragToTime (pure), minimapGesture pure reducer (11 tests), MiniMap thin adapter, WaveformCanvas targetTouches+touchcancel, CLAUDE.md. 83/83 (+16), tsc clean, build OK.
- 2026-07-13: review passed (high, 2 CONFIRMED, both FIXED): MiniMap still read e.touches (violated the CLAUDE.md rule this diff added); overviewXToTime became dead code. 81/81, tsc clean, build OK. Committed.

## Decisions

_Нетривиальные решения по ходу задачи. Одна строка на решение._

## Debt

- [ ] A-B луп: скраб за пределы [A,B] на отпускании защёлкивается обратно в луп-регион (position.ts заворачивает). Пре-существующее — у абсолютного скраба было то же.

## Blockers

_Текущие блокеры. Очистить, когда разрешены._
