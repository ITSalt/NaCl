import { join } from 'path';
import { ScopeConfig, Manifest, SyncSummary } from '../types.js';
import { scanFiles } from '../core/scanner.js';
import { writeManifest, createEmptyManifest } from '../core/manifest.js';
import { DocmostClient } from '../lib/docmost-client.js';
import { execSync } from 'child_process';

export async function runRebuildManifest(
  projectDir: string,
  scope: ScopeConfig,
  client: DocmostClient,
  spaceId: string,
  rootPageId: string
): Promise<SyncSummary> {
  const docsDir = join(projectDir, 'docs');

  // Fetch all pages from Docmost
  console.error('Fetching pages from Docmost...');
  const remotePages = await client.listPages(spaceId);
  console.error(`Found ${remotePages.length} remote pages.`);

  // Scan local files
  const scanned = await scanFiles(docsDir, scope);
  console.error(`Found ${scanned.size} local files.`);

  // Build title → pageId index from remote pages
  const titleIndex = new Map<string, { pageId: string; parentPageId: string }>();
  for (const page of remotePages) {
    const normalizedTitle = page.title?.trim().toLowerCase() || '';
    titleIndex.set(normalizedTitle, {
      pageId: page.id,
      parentPageId: page.parentPageId || rootPageId,
    });
  }

  // Match local files to remote pages by title
  const manifest: Manifest = createEmptyManifest(spaceId, rootPageId);
  let matched = 0;
  let unmatched = 0;

  for (const [relativePath, file] of scanned) {
    const normalizedTitle = file.title.trim().toLowerCase();
    const match = titleIndex.get(normalizedTitle);
    if (match) {
      manifest.pages[relativePath] = {
        pageId: match.pageId,
        parentPageId: match.parentPageId,
        contentHash: file.contentHash,
      };
      matched++;
    } else {
      unmatched++;
    }
  }

  // Try to reconstruct folder mappings
  for (const folderPath of Object.keys(scope.folderTitleMap)) {
    const folderTitle = scope.folderTitleMap[folderPath].trim().toLowerCase();
    const match = titleIndex.get(folderTitle);
    if (match) {
      manifest.folders[folderPath] = match.pageId;
    }
  }

  // Set lastSyncCommit
  try {
    manifest.lastSyncCommit = execSync('git rev-parse --short HEAD', { cwd: projectDir }).toString().trim();
  } catch {
    manifest.lastSyncCommit = 'unknown';
  }

  await writeManifest(projectDir, scope, manifest);

  return {
    mode: 'rebuild-manifest',
    scope: scope.name,
    success: true,
    stats: {
      created: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      errors: unmatched,
      foldersCreated: Object.keys(manifest.folders).length,
    },
    details: {
      created: [],
      updated: [],
      errors: unmatched > 0
        ? [{ file: `${unmatched} files`, error: 'No matching Docmost page found by title', retried: false }]
        : [],
      warnings: [],
    },
    manifest: { path: join('docs', scope.manifestFile), lastSyncCommit: manifest.lastSyncCommit },
  };
}
