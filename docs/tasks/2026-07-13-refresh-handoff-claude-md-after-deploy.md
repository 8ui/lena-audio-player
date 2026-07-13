---
id: 2026-07-13-refresh-handoff-claude-md-after-deploy
title: Refresh handoff + CLAUDE.md after deploy
type: chore
pipeline: minimal
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

- 2026-07-13: triage — pipeline `minimal`, reason: Docs only, no logic. HANDOFF is badly stale (claims device test not done, wrong commit/test counts); CLAUDE.md test count says 12/62, reality is 14/81; npm run icons undocumented. 2 files.
- 2026-07-13: docs refreshed: HANDOFF rewritten (prod URL, invariants, remaining work, debt, lessons); CLAUDE.md test count 12/62 -> 14/81, npm run icons, layers 1/2/4, tested-vs-manual section (+ what tests structurally CANNOT cover). Every claim verified against reality (tests/tsc/sync/live site/actions).

## Decisions

_Нетривиальные решения по ходу задачи. Одна строка на решение._

## Debt

_Отложенное, упрощения, известные пробелы. Формат — чекбоксы (читаются скилом `/debts-report`):_
_- `- [ ] <что отложено> — <почему/контекст>` — открытый долг_
_- `- [x] <что было> — закрыто YYYY-MM-DD: <причина/ссылка на task>` — закрытый_
_Без `[ ]`/`[x]` пункт невидим для агрегатора и теряется через 2 недели._

## Blockers

_Текущие блокеры. Очистить, когда разрешены._
