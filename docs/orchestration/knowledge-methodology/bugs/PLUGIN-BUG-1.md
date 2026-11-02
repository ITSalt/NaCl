# PLUGIN-BUG-1 — Codex init: bootstrap protocol path and generated owner guidance need adjustment

Дефект самого плагина, найденный в ходе этой программы. Текст ниже обезличен: имена программы,
модулей, сессий и репозиториев, пути и адреса заменены плейсхолдерами.

| Поле | Значение |
|------|----------|
| Найден | 2026-11-02 |
| Плагин | pepper-orchestrator 0.14.0 |
| Claude Code | 2.1.314 (Claude Code) |
| ОС | Darwin 27.0.0 (arm64) |
| Python | 3.15.2 |
| Оболочка | zsh |
| Рабочее пространство | workspace in-repo, sessions local, 1 modules (0 whole repositories, 1 streams), 1 repositories, permission mode unset, shell bash |
| Отпечаток | `pepper-orchestrator 0.14.0 Codex init: bootstrap protocol path and generated owner guidance need adjustment` |
| Issue | — |

## Команда

```text
orch.py init --client codex --sessions local
```

## Вывод (первые строки, обезличен)

```text
2026-11-02 11:16Z — A-1 recorded
2026-11-02 11:16Z — P-1 dropped
2026-11-02 11:14Z — delivery prod: orchestrator by D-1
2026-11-02 11:14Z — delivery stand: orchestrator by D-1
2026-11-02 11:14Z — delivery merge: orchestrator by D-1
2026-11-02 11:14Z — D-1 recorded
2026-11-02 11:14Z — P-1 opened for owner
2026-11-02 11:14Z — client Codex; local launch policy defaults in orch.yaml
2026-11-02 11:14Z — session kind: local, confirmed by the owner
2026-11-02 11:14Z — workspace created (ru)
```

## Ожидалось и получено

Expected: bootstrap points to orchestration/protocol.md; owner guidance reflects Codex and delegated delivery. Actual: bootstrap says protocol.md at workspace root; README says only owner merges; init opens a Claude-specific .worktreeinclude proposal.

## Обход

Applied point edits to generated workspace guidance; dropped irrelevant proposal. Installed plugin remains unchanged.

## Текст Issue

Текст для публикации в `ITSalt/PepperSkills` — `bugs/PLUGIN-BUG-1.issue.md` (на английском). Он отправляется только
через `orch.py report --apply --confirmed` после «да» владельца или при `bug_reports: auto` (решение D-n).
