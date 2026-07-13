---
id: 2026-07-13-allow-tunnel-hosts-in-vite-dev-preview
title: Allow tunnel hosts in vite dev/preview
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

- 2026-07-13: triage — pipeline `minimal`, reason: One-line dev-tooling config: vite blocks the cloudflared tunnel Host (403). Needed so the phone can reach the app over trusted HTTPS (SW/PWA/wakeLock are secure-context gated). 1 file, no logic.
- 2026-07-13: vite server/preview allowedHosts += .trycloudflare.com; tunnel serves 200 over trusted HTTPS; build+tests green.

## Decisions

_Нетривиальные решения по ходу задачи. Одна строка на решение._

## Debt

_Отложенное, упрощения, известные пробелы. Формат — чекбоксы (читаются скилом `/debts-report`):_
_- `- [ ] <что отложено> — <почему/контекст>` — открытый долг_
_- `- [x] <что было> — закрыто YYYY-MM-DD: <причина/ссылка на task>` — закрытый_
_Без `[ ]`/`[x]` пункт невидим для агрегатора и теряется через 2 недели._

## Blockers

_Текущие блокеры. Очистить, когда разрешены._
