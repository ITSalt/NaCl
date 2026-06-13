NaCl 2.22.0 — cross-platform-graph-init

A first real `/nacl-init` on native Windows (PowerShell 5.1, no WSL2) wrote the config files and then… the Neo4j MCP server never connected. The operator had to step in twice.

One root cause: Step 2c of the skill was written entirely in bash — `cp`, `command -v`, `for i in $(seq …)`, `docker exec -i … < file`, `grep -oE`. None of it runs on a native Windows shell, so the agent improvised — and the improvisation is where everything broke:

— **The launcher.** `.mcp.json` pointed at the `neo4j-mcp` npm launcher, which downloads the real binary on cold start (longer than Claude Code's 30 s MCP timeout → hangs on `connecting…`), shells out to `unzip` (absent on stock Windows), and prints a banner to STDOUT — which corrupts the stdio JSON-RPC stream on *every* OS, not just Windows.
— **The BOM.** When `cp` fell through, the files were recreated with a UTF-8 BOM that `cypher-shell` rejects on line 1.
— **The soft fallback.** A "show manual instructions and continue" branch let a half-run look complete.

What's inside:

— **One tested script per OS, not improvised shell.** `setup-graph.ps1` (Windows) and `setup-graph.sh` (macOS/Linux/WSL2) share a contract and do all of copy → resolve binary → write config → docker up → load schema → verify, deterministically. Step 2c is now thin: detect OS, dispatch, report.

— **The official binary, wired directly.** The scripts download the official `neo4j-mcp` release from GitHub and extract it natively (`Expand-Archive` / `tar`) to `~/.neo4j-mcp-bin/`, then point `.mcp.json` straight at it. No launcher → no download-on-start, no `unzip`, clean STDOUT. Existing `.mcp.json` is merged, never clobbered.

— **BOM-free everywhere**, and stripped defensively before load.

— **A hard gate, no soft exit.** "Ready" prints only when all three pass: container healthy, `SHOW CONSTRAINTS` == the count computed dynamically from the schema (no magic number to drift), and an `initialize` + `tools/list` JSON-RPC handshake against the binary succeeds. Otherwise: a loud FAILED report naming the failing check, and a non-zero exit. The half-run can't pose as done anymore.

— **Idempotent.** A re-run's benign "constraint already exists" is no longer fatal — the count gate is the verdict, so `/nacl-init` converges instead of erroring.

Verified end-to-end on live Docker + Neo4j on Windows: fresh setup, idempotent re-run, and merge-into-existing-`.mcp.json` all reach the all-green gate.

Scope is tight: Claude Code's nacl-init only. The Codex variant just creates graph files (no MCP wiring), so the divergence is recorded as a sync-exemption, not mirrored.

Release notes: docs/releases/2.22.0-cross-platform-graph-init/release-notes.md
