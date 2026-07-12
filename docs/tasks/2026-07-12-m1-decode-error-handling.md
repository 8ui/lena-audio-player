---
id: 2026-07-12-m1-decode-error-handling
title: "M1: decode error handling"
type: bug
pipeline: minimal
phase: review
created: 2026-07-12
updated: 2026-07-12
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

- 2026-07-12: triage — pipeline `minimal`, reason: Display-only bugfix, ~3 trivial files (store field + App banner). decodeAudioData reject unhandled in importFile/openTrack -> silent failure on unsupported/corrupt audio.
- 2026-07-12: impl complete: try/catch on both decode sites + store error/clearError + App banner; 39/39 tests (5 new), tsc clean, build OK
- 2026-07-12: review passed (high effort, 3 low findings): #1 test stub leak FIXED (afterEach restore); #2 rec==null silent -> debt; #3 dup catch -> intentional (different messages). 39/39, tsc clean. Awaiting user commit approval.

## Decisions

_Нетривиальные решения по ходу задачи. Одна строка на решение._

## Debt

- [ ] openTrack при rec==null (в library, но нет в IndexedDB) молча возвращает без user-facing ошибки — usePlayerStore.ts:145. Пре-существующее, редкий рассинхрон, вне M1-скоупа.

## Blockers

_Текущие блокеры. Очистить, когда разрешены._
