---
id: 2026-07-13-ios-file-picker-greys-out-mp3
title: iOS file picker greys out mp3
type: bug
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

- 2026-07-13: triage — pipeline `minimal`, reason: Device bug (iOS): accept='audio/*' wildcard does not resolve to the mp3 UTI in the iOS picker -> file greyed out, import impossible. 1 file (Library.tsx accept attr) + test. No logic change.
- 2026-07-13: impl+review: accept broadened (AUDIO_ACCEPT const: audio/* + explicit MIMEs + extensions), pinned by Library test. 67/67, tsc clean, build OK. NOTE: hypothesis (iOS accept/UTI filter) still needs device confirmation.

## Decisions

_Нетривиальные решения по ходу задачи. Одна строка на решение._

## Debt

_Отложенное, упрощения, известные пробелы. Формат — чекбоксы (читаются скилом `/debts-report`):_
_- `- [ ] <что отложено> — <почему/контекст>` — открытый долг_
_- `- [x] <что было> — закрыто YYYY-MM-DD: <причина/ссылка на task>` — закрытый_
_Без `[ ]`/`[x]` пункт невидим для агрегатора и теряется через 2 недели._

## Blockers

_Текущие блокеры. Очистить, когда разрешены._
