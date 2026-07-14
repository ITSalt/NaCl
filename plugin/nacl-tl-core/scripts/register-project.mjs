// Deterministic registry merge — extraction of nacl-init Step 2d.
//
// Why this exists: Step 2d was ~85 lines of inline bash prose that read, validated,
// merged, and atomically rewrote ~/.nacl/projects.json. As a side effect of the
// multi-user work nacl-init is becoming a thin orchestrator, so this hand-written merge
// moves into a tested tool that mirrors analyst-tool/server/src/services/project-registry.ts
// byte-for-byte (same JSON shape, `version: 1` guard, 2-space pretty-print, atomic
// tmp+rename, BOM strip, `createdAt` preserved on update). The connect/create remote paths
// reuse it unchanged. Pinned by register-project.test.mjs — including a characterization
// test that the merge result equals what the TS module would produce.
//
//   register-project.mjs --id <id> --name <name> --root <abs-path> [--registry <path>]
//   honours NACL_HOME (registry defaults to $NACL_HOME/projects.json or ~/.nacl/projects.json)

import { realpathSync, readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';

const PROJECT_ID_RE = /^[a-z0-9_-]{1,64}$/;
const EMPTY_REGISTRY = { version: 1, activeProjectId: null, projects: [] };

/**
 * Pure merge: returns a NEW registry with the project upserted and made active.
 * Mirrors project-registry.ts: existing record keeps createdAt and refreshes
 * name/root/lastUsed; a new record is appended. `now` is injected for determinism.
 * @param {{version:number, activeProjectId:(string|null), projects:Array}} registry
 * @param {{id:string, name:string, root:string, now:string}} entry
 * @returns {{registry: object, action: 'created'|'updated'}}
 */
export function mergeRegistry(registry, { id, name, root, now }) {
  if (!PROJECT_ID_RE.test(id)) {
    throw new Error(`Invalid project id: "${id}". Must match /^[a-z0-9_-]{1,64}$/`);
  }
  if (!isAbsolute(root)) {
    throw new Error(`root must be an absolute path, got: "${root}"`);
  }
  if (registry.version !== 1) {
    throw new Error(`Unsupported registry version: ${String(registry.version)}. Expected version 1.`);
  }

  const projects = registry.projects.slice();
  const idx = projects.findIndex((p) => p.id === id);
  let action;
  if (idx === -1) {
    projects.push({ id, name, root, createdAt: now, lastUsed: now });
    action = 'created';
  } else {
    projects[idx] = { ...projects[idx], name, root, lastUsed: now };  // keep createdAt
    action = 'updated';
  }

  return {
    registry: { version: 1, activeProjectId: id, projects },
    action,
  };
}

/** Parse registry text the way the TS reader does: strip a leading BOM, then JSON.parse. */
export function parseRegistry(raw) {
  return JSON.parse(raw.replace(/^﻿/, ''));
}

function resolveRegistryPath(explicit) {
  if (explicit) return explicit;
  const base = process.env.NACL_HOME ?? join(homedir(), '.nacl');
  return join(base, 'projects.json');
}

// CLI — symlink-safe main check (skills invoke via the ~/.claude/skills symlink).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--') && a.includes('=')) { const [k, v] = a.slice(2).split(/=(.*)/s); opt[k] = v; }
    else if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  }
  const { id, name, root } = opt;
  if (!id || !name || !root) {
    process.stderr.write('usage: register-project.mjs --id <id> --name <name> --root <abs-path> [--registry <path>]\n');
    process.exit(2);
  }

  try {
    const registryPath = resolveRegistryPath(opt.registry);
    const dir = dirname(registryPath);
    mkdirSync(dir, { recursive: true });
    try { chmodSync(dir, 0o700); } catch { /* Windows ignores */ }

    if (!existsSync(registryPath)) {
      writeFileSync(registryPath, JSON.stringify(EMPTY_REGISTRY, null, 2), 'utf-8');
      try { chmodSync(registryPath, 0o600); } catch { /* best-effort */ }
    }

    const current = parseRegistry(readFileSync(registryPath, 'utf-8'));
    const now = new Date().toISOString();
    const { registry, action } = mergeRegistry(current, { id, name, root, now });

    const tmp = `${registryPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(registry, null, 2), 'utf-8');
    try { chmodSync(tmp, 0o600); } catch { /* best-effort */ }
    renameSync(tmp, registryPath);

    if (action === 'created') {
      process.stdout.write(`Registered '${name}' (${id}) in ${registryPath}\n`);
    } else {
      process.stdout.write(`Updated registry entry '${id}' (root + lastUsed refreshed) in ${registryPath}\n`);
    }
  } catch (e) {
    process.stderr.write(`register-project error: ${e.message}\n`);
    process.exit(1);
  }
}

export { PROJECT_ID_RE, EMPTY_REGISTRY };
