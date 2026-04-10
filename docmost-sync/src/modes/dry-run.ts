import { join } from 'path';
import { ScopeConfig, SyncSummary } from '../types.js';
import { scanFiles } from '../core/scanner.js';
import { computeDiff } from '../core/differ.js';
import { readManifest } from '../core/manifest.js';

export async function runDryRun(projectDir: string, scope: ScopeConfig): Promise<SyncSummary> {
  const docsDir = join(projectDir, 'docs');

  const manifest = await readManifest(projectDir, scope);
  if (!manifest) {
    return {
      mode: 'dry-run',
      scope: scope.name,
      success: false,
      stats: { created: 0, updated: 0, skipped: 0, deleted: 0, errors: 1, foldersCreated: 0 },
      details: {
        created: [],
        updated: [],
        errors: [{ file: scope.manifestFile, error: 'Manifest not found. Run --mode init first.', retried: false }],
        warnings: [],
      },
      manifest: { path: join('docs', scope.manifestFile), lastSyncCommit: '' },
    };
  }

  const scanned = await scanFiles(docsDir, scope);
  const diff = computeDiff(scanned, manifest);

  return {
    mode: 'dry-run',
    scope: scope.name,
    success: true,
    stats: {
      created: diff.creates.length,
      updated: diff.updates.length,
      skipped: diff.skips.length,
      deleted: 0,
      errors: 0,
      foldersCreated: 0,
    },
    details: {
      created: diff.creates.map(f => ({ file: f.relativePath, pageId: '', title: f.title })),
      updated: diff.updates.map(f => ({ file: f.relativePath, pageId: f.pageId, title: f.title })),
      errors: [],
      warnings: diff.warnings,
    },
    manifest: { path: join('docs', scope.manifestFile), lastSyncCommit: manifest.lastSyncCommit },
  };
}
