import { join } from 'path';
import { ScopeConfig, SyncSummary } from '../types.js';
import { scanFiles } from '../core/scanner.js';
import { computeDiff } from '../core/differ.js';
import { readManifest, writeManifest, updateManifest } from '../core/manifest.js';
import { publishChanges } from '../core/publisher.js';
import { DocmostClient } from '../lib/docmost-client.js';

export async function runApply(
  projectDir: string,
  scope: ScopeConfig,
  client: DocmostClient,
  delay: number
): Promise<SyncSummary> {
  const docsDir = join(projectDir, 'docs');

  const manifest = await readManifest(projectDir, scope);
  if (!manifest) {
    return {
      mode: 'apply',
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

  if (diff.creates.length === 0 && diff.updates.length === 0) {
    return {
      mode: 'apply',
      scope: scope.name,
      success: true,
      stats: {
        created: 0,
        updated: 0,
        skipped: diff.skips.length,
        deleted: 0,
        errors: 0,
        foldersCreated: 0,
      },
      details: { created: [], updated: [], errors: [], warnings: diff.warnings },
      manifest: { path: join('docs', scope.manifestFile), lastSyncCommit: manifest.lastSyncCommit },
    };
  }

  console.error(`Publishing: ${diff.creates.length} new, ${diff.updates.length} updated...`);

  const result = await publishChanges(diff.creates, diff.updates, client, manifest, scope, delay);
  const updatedManifest = updateManifest(manifest, result, projectDir);
  await writeManifest(projectDir, scope, updatedManifest);

  const hasErrors = result.errors.length > 0;

  return {
    mode: 'apply',
    scope: scope.name,
    success: !hasErrors || result.created.length > 0 || result.updated.length > 0,
    stats: {
      created: result.created.length,
      updated: result.updated.length,
      skipped: diff.skips.length,
      deleted: 0,
      errors: result.errors.length,
      foldersCreated: 0,
    },
    details: {
      created: result.created,
      updated: result.updated,
      errors: result.errors,
      warnings: diff.warnings,
    },
    manifest: { path: join('docs', scope.manifestFile), lastSyncCommit: updatedManifest.lastSyncCommit },
  };
}
