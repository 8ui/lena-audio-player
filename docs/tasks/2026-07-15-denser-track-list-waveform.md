---
id: 2026-07-15-denser-track-list-waveform
title: Denser track-list waveform
type: feature
pipeline: minimal
phase: done
created: 2026-07-15
updated: 2026-07-15
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

- 2026-07-15: triage — pipeline `minimal`, reason: Pure display: card wave too coarse (48 symmetric bars); rebuild to min/max like the page wave, rendered as 2 SVG paths for optimization. 3 code files + tests/docs.
- 2026-07-15: brainstorm done (3 Qs answered: min/max asymmetric, 120 cols, 28px); design approved
- 2026-07-15: impl complete: waveBars(120) + 2 paths, barHeights removed, tests rewritten (18 green), tsc/build clean for touched files, docs updated
- 2026-07-15: review clean (cavecrew-reviewer: no correctness issues); 207 tests green, build ok. NOT committed — concurrent agent editing WaveformCanvas.tsx, left for user to stage separately.

## Decisions

_Нетривиальные решения по ходу задачи. Одна строка на решение._

## Debt

_Отложенное, упрощения, известные пробелы. Формат — чекбоксы (читаются скилом `/debts-report`):_
_- `- [ ] <что отложено> — <почему/контекст>` — открытый долг_
_- `- [x] <что было> — закрыто YYYY-MM-DD: <причина/ссылка на task>` — закрытый_
_Без `[ ]`/`[x]` пункт невидим для агрегатора и теряется через 2 недели._

## Blockers

_Текущие блокеры. Очистить, когда разрешены._
