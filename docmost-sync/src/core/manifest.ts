import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import { Manifest, PublishResult, ScopeConfig } from '../types.js';

/**
 * Reads the manifest file from the project's docs/ directory.
 * Returns null if the file does not exist or cannot be parsed.
 */
export async function readManifest(projectDir: string, scope: ScopeConfig): Promise<Manifest | null> {
  const path = join(projectDir, 'docs', scope.manifestFile);
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as Manifest;
  } catch {
    return null;
  }
}

/**
 * Writes the manifest file to the project's docs/ directory.
 */
export async function writeManifest(projectDir: string, scope: ScopeConfig, manifest: Manifest): Promise<void> {
  const path = join(projectDir, 'docs', scope.manifestFile);
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/**
 * Updates the manifest in-place with results from a publish operation.
 * - Adds entries for newly created pages
 * - Updates contentHash for updated pages
 * - Sets lastSyncCommit from current git HEAD
 */
export function updateManifest(manifest: Manifest, result: PublishResult, projectDir: string): Manifest {
  for (const created of result.created) {
    manifest.pages[created.file] = {
      pageId: created.pageId,
      parentPageId: manifest.folders[getParentFolder(created.file)] || manifest.rootPageId,
      contentHash: '', // Will be set by publisher during create
    };
  }

  for (const updated of result.updated) {
    if (manifest.pages[updated.file]) {
      // contentHash is already updated by publisher in-place
    }
  }

  try {
    manifest.lastSyncCommit = execSync('git rev-parse --short HEAD', {
      cwd: projectDir,
      encoding: 'utf-8',
    }).trim();
  } catch {
    // git not available or not a git repo, skip
  }

  return manifest;
}

/**
 * Creates a fresh empty manifest.
 */
export function createEmptyManifest(spaceId: string, rootPageId: string): Manifest {
  return {
    spaceId,
    rootPageId,
    lastSyncCommit: '',
    pages: {},
    folders: {},
  };
}

/**
 * Extracts the parent folder path from a relative file path.
 * e.g. '11-domain/entities/order.md' -> '11-domain/entities'
 * e.g. '_index.md' -> ''
 */
function getParentFolder(relativePath: string): string {
  const parts = relativePath.split('/');
  parts.pop(); // remove filename
  return parts.join('/');
}
