Reported by an agent with `orch.py report` (pepper-orchestrator). Names, paths and addresses of the
reporter's program are replaced with placeholders.

### Plugin and version

pepper-orchestrator 0.14.0

### Environment

- Claude Code: 2.1.314 (Claude Code)
- OS: Darwin 27.0.0 (arm64)
- Python: 3.15.2
- Shell: zsh
- Workspace: workspace in-repo, sessions local, 1 modules (0 whole repositories, 1 streams), 1 repositories, permission mode unset, shell bash

### Command

```text
orch.py init --client codex --sessions local
```

### Output (first lines, anonymized)

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

### Expected and actual

Expected: bootstrap points to orchestration/protocol.md; owner guidance reflects Codex and delegated delivery. Actual: bootstrap says protocol.md at workspace root; README says only owner merges; init opens a Claude-specific .worktreeinclude proposal.

### Workaround

Applied point edits to generated workspace guidance; dropped irrelevant proposal. Installed plugin remains unchanged.

### Fingerprint

`pepper-orchestrator 0.14.0 Codex init: bootstrap protocol path and generated owner guidance need adjustment`

- [x] The report is anonymized (no private names, paths, addresses or secrets).
