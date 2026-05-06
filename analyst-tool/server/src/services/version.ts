/**
 * version — captures the running build's identity once, at process start.
 *
 * Surfaces:
 *   - `version`   — npm package.json version
 *   - `gitSha`    — short SHA of the analyst-tool worktree at startup time, or
 *                   `'unknown'` if `git` is not on PATH or the install lives
 *                   outside a git checkout (e.g. installed via `npm i -g`).
 *   - `startedAt` — ISO timestamp captured the first time this module is
 *                   imported. Used by `/api/v1/version` and the startup log.
 *
 * Computed eagerly at import time so we pay the cost (a sync git exec, a
 * package.json read) once. The result is frozen.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

interface VersionInfo {
  readonly version: string;
  readonly gitSha: string;
  readonly startedAt: string;
}

function readPackageVersion(): string {
  // dist/services/version.js → ../../../package.json (workspace root) is
  // installed via npm. From src/services/version.ts in dev, climb the same
  // number of dirs.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', '..', 'package.json'),       // dist/services/ → workspace root
    join(here, '..', '..', '..', 'package.json'), // src/services/ → workspace root
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, 'utf-8');
      const parsed = JSON.parse(raw) as { version?: string; name?: string };
      if (parsed.name === 'analyst-tool-server' || parsed.name === 'analyst-tool') {
        return parsed.version ?? '0.0.0';
      }
    } catch {
      // try next candidate
    }
  }
  return '0.0.0';
}

function readGitSha(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const sha = execSync('git rev-parse --short HEAD', {
      cwd: here,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 1000,
    }).trim();
    if (!sha) return 'unknown';
    // Append "-dirty" when the working tree has uncommitted changes so the
    // operator can tell a build from uncommitted source apart from a clean one.
    try {
      const status = execSync('git status --porcelain', {
        cwd: here,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
        timeout: 1000,
      });
      return status.length > 0 ? `${sha}-dirty` : sha;
    } catch {
      return sha;
    }
  } catch {
    return 'unknown';
  }
}

const INFO: VersionInfo = Object.freeze({
  version: readPackageVersion(),
  gitSha: readGitSha(),
  startedAt: new Date().toISOString(),
});

export function getVersionInfo(): VersionInfo {
  return INFO;
}
