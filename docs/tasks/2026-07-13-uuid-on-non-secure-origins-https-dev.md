---
id: 2026-07-13-uuid-on-non-secure-origins-https-dev
title: uuid on non-secure origins + HTTPS dev
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

- 2026-07-13: triage — pipeline `minimal`, reason: Bug found on device: crypto.randomUUID is secure-context gated, undefined over plain-HTTP LAN -> importFile and addMarker throw. Fix: uuid() helper on getRandomValues (not gated). Plus HTTPS dev so SW/PWA/wakeLock (also secure-context gated) become testable. Small: new uuid.ts + 2 call sites.
- 2026-07-13: impl: src/uuid.ts (randomUUID -> getRandomValues v4 fallback) + both call sites (importFile, addMarker). 65/65 (+3), tsc clean.
- 2026-07-13: review passed (high, 2 low, both FIXED): inconsistent crypto guard; missing call-site test. 66/66, tsc clean, build OK. Committed.

## Decisions

_Нетривиальные решения по ходу задачи. Одна строка на решение._

## Debt

_Отложенное, упрощения, известные пробелы. Формат — чекбоксы (читаются скилом `/debts-report`):_
_- `- [ ] <что отложено> — <почему/контекст>` — открытый долг_
_- `- [x] <что было> — закрыто YYYY-MM-DD: <причина/ссылка на task>` — закрытый_
_Без `[ ]`/`[x]` пункт невидим для агрегатора и теряется через 2 недели._

## Blockers

_Текущие блокеры. Очистить, когда разрешены._
