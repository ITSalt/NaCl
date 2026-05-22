---
id: UC-003
title: Regenerate Board from Graph — API contract
feature_request: FR-001
status: no-change
---

# UC-003 — API Contract

## Status for FR-001: NO CHANGE

FR-001 changes the activity renderer's **output** (adds a title text element to the
generated `.excalidraw` scene). It does **not** change any HTTP endpoint contract.

The skill-runner endpoint stays as-is:

| Method | Path                  | Body / Params                 | Response                                |
|--------|-----------------------|-------------------------------|-----------------------------------------|
| POST   | `/skills/regenerate`  | `{ board: string }`           | `{ runId: string }` (run is queued)     |

The renderer change is observable only through the `.excalidraw` file content
(see `task-be.md` for the title element shape) and through the existing
`board.changed` WebSocket event.

## Shared Types

No new shared types. The renderer writes Excalidraw JSON directly to disk; the
client never deserializes the title element specifically — it just loads the
scene as-is.

## Errors

No new error codes.

## Authentication

Unchanged. `SR-ANALYST` (single local user, full access).
