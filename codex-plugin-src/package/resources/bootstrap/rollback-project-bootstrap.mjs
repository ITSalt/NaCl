#!/usr/bin/env node

import { copyFileSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

function stop(code) {
  process.stderr.write(`NACL_ROLLBACK_FILES: status=FAILED code=${code}\n`);
  process.exit(1);
}

const selected = {};
for (let index = 2; index < process.argv.length; index += 2) {
  if (!process.argv[index]?.startsWith("--") || index + 1 >= process.argv.length) stop("ARGUMENT_INVALID");
  selected[process.argv[index].slice(2)] = process.argv[index + 1];
}
for (const key of ["project-root", "graph-state", "config-state", "config-dir-state", "gitignore-state"]) if (!selected[key]) stop("ARGUMENT_MISSING");
const root = path.resolve(selected["project-root"]);
if (!path.isAbsolute(selected["project-root"]) || !existsSync(root) || lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) stop("PROJECT_ROOT_UNSAFE");
for (const key of ["graph-state", "config-state", "config-dir-state", "gitignore-state"]) if (!new Set(["absent", "preexisting"]).has(selected[key])) stop("STATE_INVALID");

function safeBackup(filename) {
  if (!filename || !path.isAbsolute(filename) || !existsSync(filename)) stop("BACKUP_UNAVAILABLE");
  const metadata = lstatSync(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink()) stop("BACKUP_UNSAFE");
}

function restore(relative, state, backup) {
  const target = path.join(root, relative);
  if (state === "preexisting") {
    safeBackup(backup);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.nacl-rollback-${process.pid}.tmp`;
    copyFileSync(backup, temporary);
    renameSync(temporary, target);
  } else if (existsSync(target)) {
    const metadata = lstatSync(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) stop("ROLLBACK_TARGET_UNSAFE");
    rmSync(target);
  }
}

try {
  restore(path.join(".codex", "config.toml"), selected["config-state"], selected["config-backup"]);
  restore(".gitignore", selected["gitignore-state"], selected["gitignore-backup"]);
  const configDir = path.join(root, ".codex");
  if (selected["config-dir-state"] === "absent" && existsSync(configDir)) {
    const metadata = lstatSync(configDir);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) stop("CODEX_DIR_ROLLBACK_UNSAFE");
    try { rmSync(configDir); } catch (error) { if (error?.code !== "ENOTEMPTY") throw error; }
  }
  const graphDir = path.join(root, "graph-infra");
  if (selected["graph-state"] === "absent" && existsSync(graphDir)) {
    const metadata = lstatSync(graphDir);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) stop("GRAPH_ROLLBACK_UNSAFE");
    rmSync(graphDir, { recursive: true });
  }
} catch {
  stop("ROLLBACK_APPLY_FAILED");
}
process.stdout.write(`NACL_ROLLBACK_FILES: status=VERIFIED graph=${selected["graph-state"] === "absent" ? "removed" : "preserved-preexisting"} config=restored gitignore=restored\n`);
