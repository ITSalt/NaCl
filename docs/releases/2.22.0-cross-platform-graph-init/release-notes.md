# NaCl 2.22.0 — cross-platform-graph-init

**`/nacl-init` sets up the Neo4j graph the same way on Windows, macOS, and Linux — and
when it can't, it says so loudly instead of looking finished.**

## The problem

A first real run of `/nacl-init` (graph enabled) on **native Windows 11, PowerShell 5.1,
no WSL2** produced the config files — and then the Neo4j MCP server never connected. The
operator had to intervene twice before the graph was usable.

Every symptom traced to **one** root cause: Step 2c of the skill was written entirely in
bash — `cp`, `command -v`, `for i in $(seq 1 12)`, `docker exec -i … < "$f"` stdin
redirect, `grep -oE`, `cd -P "$HOME/.claude/…"`. None of that runs on a native Windows
shell. When it fell through, the agent improvised, and the improvisation is exactly where
things broke:

- **The launcher.** `.mcp.json` pointed at the `neo4j-mcp` npm launcher. On a cold start
  it downloads the real binary from GitHub — routinely longer than Claude Code's **30 s**
  MCP connect timeout, so the server hangs on `connecting…` and times out. On Windows it
  also shells out to `unzip` (absent on stock Windows). And it prints a human banner to
  **STDOUT** — for a stdio MCP server, STDOUT must carry only JSON-RPC, so the banner
  corrupts the protocol stream *on every OS*, not just Windows.
- **The BOM.** The committed `.cypher` files are clean, but when the bash `cp` failed the
  agent recreated them with a tool that defaults to a UTF-8 BOM. `cypher-shell` rejects
  the first line: `Invalid input '?'`.
- **The soft fallback.** A "if schema loading failed, show fallback instructions" branch
  let a run *look* complete while nothing was actually running or loaded.

## What's inside

— **One tested script per OS, not improvised shell.** `nacl-tl-core/scripts/setup-graph.ps1`
(Windows PowerShell 5.1+) and `setup-graph.sh` (POSIX: macOS / Linux / WSL2) share one
contract and do all of Step 2c.3–2c.6 deterministically: copy the infra byte-for-byte →
resolve the binary → write config → bring Docker up → load schema → verify. Step 2c in the
skill is now thin: detect OS, dispatch, report.

— **The official binary, wired directly.** The scripts download the **official**
`neo4j-mcp` release straight from GitHub and extract it natively (`Expand-Archive` on
Windows, `tar` on POSIX) to a stable `~/.neo4j-mcp-bin/neo4j-mcp[.exe]`, then write
`.mcp.json` pointing **at that binary**. No npm launcher means no download-on-start, no
`unzip` dependency, and clean STDOUT (the binary writes diagnostics to STDERR). Sets
`NEO4J_TELEMETRY=false`. An existing `.mcp.json` is merged, never clobbered.

— **BOM-free writes, everywhere.** `.env` / `.mcp.json` / schema copies are written as
UTF-8 without a BOM (`WriteAllText` + `UTF8Encoding($false)` on Windows; `printf` on
POSIX), and a BOM is stripped defensively before the schema is loaded.

— **A hard gate, no soft exit.** "Graph Infrastructure Ready" prints only when all three
pass: the container reports **healthy**, `SHOW CONSTRAINTS` returns the count *computed
dynamically from the loaded schema* (no magic number to drift — the current schema is 41),
and a one-shot `initialize` + `tools/list` JSON-RPC handshake against the resolved binary
returns a valid response. On any failure the skill prints a loud `FAILED` report naming the
failing check and its remedy — and exits non-zero. The half-run can no longer masquerade as
done.

— **Idempotent.** A re-run hits the schema's benign "constraint already exists"; that is no
longer fatal, because the constraint-count gate — not the loader's exit code — is the
verdict. Re-running `/nacl-init` after fixing a cause converges instead of erroring.

— **Verified on real hardware.** The Windows path was exercised end-to-end against live
Docker + Neo4j: fresh setup, idempotent re-run, and merge-into-existing-`.mcp.json` (other
servers preserved, output BOM-free) all reach the all-green gate; the failure path exits
non-zero with the loud report.

## Scope

Claude Code's `nacl-init` only. The Codex variant delegates graph work to
`nacl-init-project.sh`, which merely *creates* graph-infra files (byte-preserving copy of
the clean schema) and neither writes `.mcp.json` nor starts the server — the launcher / BOM
/ banner failure modes don't arise there, so the divergence is recorded in
`skills-for-codex/sync-exemptions/nacl-init.md` rather than mirrored.

Telegram post: docs/releases/2.22.0-cross-platform-graph-init/tg-post.md
