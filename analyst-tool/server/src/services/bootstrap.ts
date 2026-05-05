/**
 * bootstrap — sync-on-startup behaviour for Wave 6.A.
 *
 * If a config.yaml is found in the repository root (or the cwd walk-up result)
 * and it contains a project.id that matches a known registry entry, we call
 * syncProjectRoot() to keep root + lastUsed up-to-date.
 *
 * This module does NOT register unknown projects.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { getConfig } from '../config.js';
import { syncProjectRoot } from './project-registry.js';

// ---------------------------------------------------------------------------
// Minimal shape we care about in config.yaml
// ---------------------------------------------------------------------------

interface ConfigYamlShape {
  project?: {
    id?: string;
    name?: string;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Exported helper — read project.id from config.yaml at a given root
// ---------------------------------------------------------------------------

/**
 * Reads config.yaml from the given root and returns project.id if present.
 * Returns null on any error or if project.id is absent. Never throws.
 */
export async function readCwdProjectId(root: string): Promise<string | null> {
  const yamlPath = join(root, 'config.yaml');
  if (!existsSync(yamlPath)) return null;
  try {
    const raw = await readFile(yamlPath, 'utf-8');
    const parsed = parseYaml(raw) as ConfigYamlShape;
    const id = parsed?.project?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Called once on server startup.
 * Reads config.yaml from the resolved repoRoot; if project.id is found and
 * matches a known registry entry, syncs its root.
 *
 * Never throws — errors are logged at debug level.
 */
export async function syncOnStartup(): Promise<void> {
  const { repoRoot } = getConfig();
  const yamlPath = join(repoRoot, 'config.yaml');

  if (!existsSync(yamlPath)) {
    // No config.yaml — nothing to sync
    return;
  }

  let raw: string;
  try {
    raw = await readFile(yamlPath, 'utf-8');
  } catch (err) {
    // Can't read the file — ignore
    console.debug(`[bootstrap] Could not read config.yaml at ${yamlPath}: ${String(err)}`);
    return;
  }

  let parsed: ConfigYamlShape;
  try {
    parsed = parseYaml(raw) as ConfigYamlShape;
  } catch (err) {
    console.debug(`[bootstrap] Could not parse config.yaml at ${yamlPath}: ${String(err)}`);
    return;
  }

  const projectId = parsed?.project?.id;
  if (!projectId || typeof projectId !== 'string') {
    console.debug(`[bootstrap] config.yaml has no project.id — skipping sync`);
    return;
  }

  try {
    const result = await syncProjectRoot(projectId, repoRoot);
    if (result) {
      console.info(`[bootstrap] Synced project "${projectId}" root to ${repoRoot}`);
    } else {
      console.debug(`[bootstrap] project.id "${projectId}" not in registry — skipping sync`);
    }
  } catch (err) {
    console.debug(`[bootstrap] syncProjectRoot failed: ${String(err)}`);
  }
}
