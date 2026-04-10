import { join } from 'path';
import { ScopeConfig, Manifest, SyncSummary } from '../types.js';
import { scanFiles } from '../core/scanner.js';
import { writeManifest, createEmptyManifest, updateManifest } from '../core/manifest.js';
import { publishChanges } from '../core/publisher.js';
import { DocmostClient } from '../lib/docmost-client.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runInit(
  projectDir: string,
  scope: ScopeConfig,
  client: DocmostClient,
  spaceId: string,
  rootPageId: string,
  delay: number
): Promise<SyncSummary> {
  const docsDir = join(projectDir, 'docs');

  // Create empty manifest
  const manifest: Manifest = createEmptyManifest(spaceId, rootPageId);

  // Scan all files
  const scanned = await scanFiles(docsDir, scope);
  console.error(`Found ${scanned.size} files to publish.`);

  // Create folder pages first
  let foldersCreated = 0;
  const folderPaths = Object.keys(scope.folderTitleMap).sort((a, b) => {
    // Sort by depth (fewer slashes first) to create parents before children
    const depthA = a.split('/').length;
    const depthB = b.split('/').length;
    return depthA - depthB;
  });

  for (const folderPath of folderPaths) {
    const title = scope.folderTitleMap[folderPath];
    // Determine parent: walk up to find parent folder or use rootPageId
    const parts = folderPath.split('/');
    parts.pop();
    let parentId = rootPageId;
    while (parts.length > 0) {
      const parentPath = parts.join('/');
      if (manifest.folders[parentPath]) {
        parentId = manifest.folders[parentPath];
        break;
      }
      parts.pop();
    }

    try {
      console.error(`Creating folder: ${title} (${folderPath})`);
      const pageId = await client.createPage(title, '', spaceId, parentId);
      manifest.folders[folderPath] = pageId;
      foldersCreated++;
      await sleep(delay);
    } catch (err) {
      console.error(`Error creating folder ${folderPath}: ${err}`);
      // Continue — files in this folder will use parent or root
    }
  }

  // Convert scanned files to creates array (all files are new in init)
  const creates = Array.from(scanned.values());

  console.error(`Publishing ${creates.length} pages...`);
  const result = await publishChanges(creates, [], client, manifest, scope, delay);
  const updatedManifest = updateManifest(manifest, result, projectDir);
  await writeManifest(projectDir, scope, updatedManifest);

  return {
    mode: 'init',
    scope: scope.name,
    success: result.errors.length === 0,
    stats: {
      created: result.created.length,
      updated: 0,
      skipped: 0,
      deleted: 0,
      errors: result.errors.length,
      foldersCreated,
    },
    details: {
      created: result.created,
      updated: [],
      errors: result.errors,
      warnings: [],
    },
    manifest: { path: join('docs', scope.manifestFile), lastSyncCommit: updatedManifest.lastSyncCommit },
  };
}
