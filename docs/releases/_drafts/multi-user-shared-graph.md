# Draft fragment: multi-user shared graph (absorb into the next release notes)

## Headline

NaCl projects can now share ONE spec graph on a VPS across several developers over the public
internet — opt-in per project, with local-only projects byte-for-byte unchanged.

## Why

Each project ran its own local Neo4j container; collaboration meant one-shot encrypted handovers,
not concurrent work. Teams in different locations needed a single live graph with real access
control.

## How it works (one paragraph)

Skills only ever talk to the graph through the `neo4j` MCP server, so the connection abstraction
was already in the right place. In `mode: remote` the MCP keeps pointing at
`bolt://localhost:<sidecar_port>`; a per-developer **ghostunnel mTLS tunnel** carries that to a
gateway in front of the VPS Neo4j. Each developer holds a personal **client certificate** (the
revocable "API key", signed by a private CA we provision) — instant revocation via CRL, no shared
password rotation, Neo4j **Community** Edition (no licensing cost). `/nacl-init` became a thin
orchestrator that resolves `local | create | connect` and dispatches to tested tools. Joining an
existing project (`--scale=connect`, or auto-detected from a committed `graph.mode: remote`) creates
no Docker and seeds nothing — a hard `project-exists` gate prevents attaching to an empty graph.

## Talking points / TG post seed

- "Несколько программистов — один граф." Shared spec graph on a VPS, доступ через интернет.
- Безопасность = персональный mTLS-сертификат на разработчика (отзываемый «API-ключ») + общий
  сильный пароль БД как второй фактор. Neo4j наружу не смотрит — только mTLS-гейтвей.
- Локальный режим не тронут: нет `graph.mode` ⇒ `local`. Миграция local→cloud — один скрипт с
  откатом на каждом шаге.
- 7 новых детерминированных инструментов с юнит-тестами (паттерн skill-tools); `nacl-init`
  похудел — Step 2d (реестр) и mcp-merge вынесены в тулы.

## Verification status (be honest in final notes)

- Client toolchain + claim-lock + config schema: unit-tested (133 tool tests green), CLI-smoke-tested.
- VPS/mTLS/migration shell: syntax-checked + compose validated; **end-to-end mTLS needs a real VPS**.
- Per-skill remote-mode wiring (tl-full/next/status/ship/diagnose prose + codex mirrors): **done** —
  spec + `claim-task.mjs` + all five skills wired (root + codex, sync gate paired).

## Follow-ups

- Dedupe `setup-graph.sh`/`.ps1`'s inline binary resolver against `lib-neo4j-mcp.*` (needs a runtime
  graph test before refactoring the tested local path).
- Live end-to-end run on a real VPS (provision → connect from a 2nd machine → concurrent claim →
  migrate), recorded per the publishable-benchmark convention.
