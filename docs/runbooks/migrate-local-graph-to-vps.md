# Runbook: migrate a local graph to the shared VPS

**Для кого / Audience.** A developer with an existing LOCAL project graph who wants to move it to a
shared VPS and re-point the local project to the shared graph — safely and reversibly.

**Что получится / Outcome.** The local graph's contents live on the VPS; the local project is now
`mode: remote`; the local container is stopped but its volume is kept as a cold rollback.

**Non-negotiables.** Fail loud, idempotent, explicit confirmation before destructive steps, full
rollback at every gate. The encrypted export is the rollback point; nothing deletes the local
volume by default.

## Prerequisites

- The VPS project is already provisioned (`provision-vps.sh`) and your tunnel is running
  (`install-sidecar.sh --start`), so `--uri` (a local sidecar socket) reaches the shared graph.
- SSH access to the VPS. Tools: `age expect gzip jq docker ssh scp node`.

## Steps

```sh
sh <NaCl>/graph-infra/scripts/migrate-to-remote.sh \
  --project-root "$(pwd)" --skills-dir <NaCl> \
  --vps-ssh deploy@graph.example.com --vps-state-dir /etc/nacl-graph \
  --scope acme-billing --vps-prefix acme-billing \
  --uri bolt://localhost:3700 --host graph.example.com --gateway-port 7687
```

What it does, with a gate at each step:

1. **Preflight** — local container healthy; project is `mode: local` (refuses double migration);
   VPS project dir exists; remote reachable via your sidecar.
2. **Backup** — `handover-export.sh` produces an encrypted artifact + manifest (the rollback point).
3. **Ship + import** — `scp` to the VPS, then `handover-import.sh` runs THERE (its `docker exec` +
   count/label re-verification against the manifest, `die` on mismatch).
4. **Re-point** — rewrites `.mcp.json` + `config.yaml` to `mode: remote`, backing up the originals
   to `graph-infra/handover/repoint-backup/`.
5. **Verify** — independently re-reads node counts through the NEW config path and compares to the
   manifest; on mismatch it **auto-restores** the local config and aborts.
6. **Decommission** — `docker compose down` (containers only; the local volume stays as a cold
   rollback). It ends with `NACL_MIGRATE_RESULT: status=READY|FAILED`.

## Rollback

At any failure (or afterwards), restore from `graph-infra/handover/repoint-backup/` and bring the
local container back — the volume is intact:

```sh
cp graph-infra/handover/repoint-backup/config.yaml.bak config.yaml
cp graph-infra/handover/repoint-backup/.mcp.json.bak .mcp.json   # if present
cd graph-infra && docker compose up -d
```

When you are confident the migration is good, free the local disk: `cd graph-infra && docker compose down -v`.

## Definition of Done

- [ ] `NACL_MIGRATE_RESULT: status=READY`.
- [ ] Remote node/relationship counts match the export manifest.
- [ ] `config.yaml` is `mode: remote`; restarting Claude Code connects to the shared graph.
- [ ] Local volume preserved (until you deliberately remove it).
