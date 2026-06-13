/**
 * project-registry — reads/writes ~/.nacl/projects.json.
 *
 * Intentionally thin: no auto-registration. Projects are added only via
 * the nacl-init skill update (Wave 6.E). This module only reads, validates,
 * and provides sync helpers.
 */
import { readFile, writeFile, rename, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectRecord = {
  id: string;
  name: string;
  root: string;
  createdAt: string;
  lastUsed: string;
};

export type ProjectRegistry = {
  version: 1;
  activeProjectId: string | null;
  projects: ProjectRecord[];
};

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class InvalidProjectIdError extends Error {
  constructor(id: string) {
    super(`Invalid project id: "${id}". Must match /^[a-z0-9_-]{1,64}$/`);
    this.name = 'InvalidProjectIdError';
  }
}

export class UnsupportedRegistryVersionError extends Error {
  constructor(version: unknown, registryPath: string) {
    super(
      `Unsupported registry version: ${String(version)}. Expected version 1. ` +
        `Fix or remove: ${registryPath}`,
    );
    this.name = 'UnsupportedRegistryVersionError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID_RE = /^[a-z0-9_-]{1,64}$/;

const EMPTY_REGISTRY: ProjectRegistry = {
  version: 1,
  activeProjectId: null,
  projects: [],
};

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/** Returns path to projects.json; honours NACL_HOME env, defaults to ~/.nacl/projects.json */
export function getRegistryPath(): string {
  const base = process.env['NACL_HOME'] ?? join(homedir(), '.nacl');
  return join(base, 'projects.json');
}

function getNaclDir(): string {
  return join(getRegistryPath(), '..');
}

// ---------------------------------------------------------------------------
// Low-level I/O
// ---------------------------------------------------------------------------

/** Creates ~/.nacl/ and an empty registry file if missing. Idempotent. */
export async function ensureRegistry(): Promise<void> {
  const naclDir = getNaclDir();
  const filePath = getRegistryPath();

  await mkdir(naclDir, { recursive: true });
  try {
    await chmod(naclDir, 0o700);
  } catch {
    // best-effort; Windows ignores chmod
  }

  if (!existsSync(filePath)) {
    await writeFile(filePath, JSON.stringify(EMPTY_REGISTRY, null, 2), { encoding: 'utf-8' });
    try {
      await chmod(filePath, 0o600);
    } catch {
      // best-effort
    }
  }
}

/** Loads and validates the registry file. Throws on malformed JSON or wrong version. */
export async function loadRegistry(): Promise<ProjectRegistry> {
  const filePath = getRegistryPath();
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Could not read registry at ${filePath}: ${String(err)}`);
  }

  let parsed: unknown;
  try {
    // Strip a leading UTF-8 BOM. Windows editors and PowerShell (Out-File /
    // Set-Content without `-Encoding utf8`) prepend one, which breaks JSON.parse.
    parsed = JSON.parse(raw.replace(/^﻿/, ''));
  } catch (err) {
    throw new Error(`Malformed JSON in registry at ${filePath}: ${String(err)}`);
  }

  const reg = parsed as ProjectRegistry;

  if (reg.version !== 1) {
    throw new UnsupportedRegistryVersionError(reg.version, filePath);
  }

  return reg;
}

/** Atomically writes the registry (tmp + rename). Best-effort chmod 0600. */
export async function saveRegistry(reg: ProjectRegistry): Promise<void> {
  const filePath = getRegistryPath();
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(reg, null, 2), { encoding: 'utf-8' });
  try {
    await chmod(tmp, 0o600);
  } catch {
    // best-effort
  }
  await rename(tmp, filePath);
}

// ---------------------------------------------------------------------------
// Higher-level API
// ---------------------------------------------------------------------------

export async function listProjects(): Promise<ProjectRecord[]> {
  const reg = await loadRegistry();
  return reg.projects;
}

export async function findProjectById(id: string): Promise<ProjectRecord | null> {
  const reg = await loadRegistry();
  return reg.projects.find((p) => p.id === id) ?? null;
}

export async function getActiveProject(): Promise<ProjectRecord | null> {
  const reg = await loadRegistry();
  if (!reg.activeProjectId) return null;
  return reg.projects.find((p) => p.id === reg.activeProjectId) ?? null;
}

/**
 * Sets the active project by id. Throws `InvalidProjectIdError` if id format is wrong,
 * or a plain `Error` if the id is not found in the registry.
 */
export async function setActiveProject(id: string): Promise<ProjectRecord> {
  if (!PROJECT_ID_RE.test(id)) {
    throw new InvalidProjectIdError(id);
  }
  const reg = await loadRegistry();
  const record = reg.projects.find((p) => p.id === id);
  if (!record) {
    throw new Error(`Project "${id}" not found in registry`);
  }
  reg.activeProjectId = id;
  await saveRegistry(reg);
  return record;
}

/**
 * Updates root and lastUsed for an existing project record.
 * No-op (returns null) if id is unknown. Does NOT register new projects.
 */
export async function syncProjectRoot(
  id: string,
  root: string,
): Promise<ProjectRecord | null> {
  if (!isAbsolute(root)) {
    throw new Error(`root must be an absolute path, got: "${root}"`);
  }
  const reg = await loadRegistry();
  const idx = reg.projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;

  reg.projects[idx] = {
    ...reg.projects[idx],
    root,
    lastUsed: new Date().toISOString(),
  };
  await saveRegistry(reg);
  return reg.projects[idx];
}
