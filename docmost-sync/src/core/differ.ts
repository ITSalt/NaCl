import { DiffResult, Manifest, ScannedFile } from '../types.js';

/**
 * Computes the diff between scanned local files and the manifest (last sync state).
 *
 * Classification:
 *   - File exists locally, not in manifest       -> CREATE
 *   - File exists locally, hash differs           -> UPDATE
 *   - File exists locally, hash matches           -> SKIP
 *   - File in manifest but missing locally        -> WARNING (deleted_locally)
 */
export function computeDiff(scanned: Map<string, ScannedFile>, manifest: Manifest): DiffResult {
  const creates: ScannedFile[] = [];
  const updates: Array<ScannedFile & { pageId: string }> = [];
  const skips: string[] = [];
  const warnings: Array<{ file: string; pageId: string; warning: string }> = [];

  // Classify each scanned file
  for (const [relativePath, file] of scanned) {
    const manifestEntry = manifest.pages[relativePath];

    if (!manifestEntry) {
      // New file, not yet in Docmost
      creates.push(file);
    } else if (manifestEntry.contentHash !== file.contentHash) {
      // Content changed since last sync
      updates.push({ ...file, pageId: manifestEntry.pageId });
    } else {
      // No changes
      skips.push(relativePath);
    }
  }

  // Check for files deleted locally but still in manifest
  for (const [relativePath, entry] of Object.entries(manifest.pages)) {
    if (!scanned.has(relativePath)) {
      warnings.push({
        file: relativePath,
        pageId: entry.pageId,
        warning: 'deleted_locally',
      });
    }
  }

  return { creates, updates, skips, warnings };
}
