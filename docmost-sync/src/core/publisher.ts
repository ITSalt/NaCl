import { ScannedFile, PublishResult, Manifest, ScopeConfig } from '../types.js';
import { DocmostClient } from '../lib/docmost-client.js';

/**
 * Publishes file changes (creates and updates) to Docmost via the API client.
 *
 * Each operation is retried once on failure. A configurable delay is inserted
 * between requests to avoid overloading the server (default 500ms).
 *
 * The manifest is updated in-place as pages are created/updated so that
 * partial progress is preserved even if later operations fail.
 */
export async function publishChanges(
  creates: ScannedFile[],
  updates: Array<ScannedFile & { pageId: string }>,
  client: DocmostClient,
  manifest: Manifest,
  scope: ScopeConfig,
  delay: number = 500,
): Promise<PublishResult> {
  const result: PublishResult = { created: [], updated: [], errors: [] };

  // Process creates
  for (const file of creates) {
    const parentPageId = resolveParentPageId(file.relativePath, manifest);

    try {
      const pageId = await client.createPage(file.title, file.content, manifest.spaceId, parentPageId);
      result.created.push({ file: file.relativePath, pageId, title: file.title });
      manifest.pages[file.relativePath] = {
        pageId,
        parentPageId: parentPageId || manifest.rootPageId,
        contentHash: file.contentHash,
      };
    } catch (err) {
      // Retry once
      try {
        await sleep(delay);
        const pageId = await client.createPage(file.title, file.content, manifest.spaceId, parentPageId);
        result.created.push({ file: file.relativePath, pageId, title: file.title });
        manifest.pages[file.relativePath] = {
          pageId,
          parentPageId: parentPageId || manifest.rootPageId,
          contentHash: file.contentHash,
        };
      } catch (retryErr) {
        result.errors.push({
          file: file.relativePath,
          error: String(retryErr),
          retried: true,
        });
      }
    }

    await sleep(delay);
  }

  // Process updates
  for (const file of updates) {
    try {
      await client.updatePage(file.pageId, file.content);
      result.updated.push({ file: file.relativePath, pageId: file.pageId, title: file.title });
      manifest.pages[file.relativePath].contentHash = file.contentHash;
    } catch (err) {
      // Retry once
      try {
        await sleep(delay);
        await client.updatePage(file.pageId, file.content);
        result.updated.push({ file: file.relativePath, pageId: file.pageId, title: file.title });
        manifest.pages[file.relativePath].contentHash = file.contentHash;
      } catch (retryErr) {
        result.errors.push({
          file: file.relativePath,
          error: String(retryErr),
          retried: true,
        });
      }
    }

    await sleep(delay);
  }

  return result;
}

/**
 * Resolves the parent page ID for a file by walking up the directory tree
 * and looking for a matching entry in manifest.folders.
 *
 * Falls back to manifest.rootPageId if no folder mapping is found.
 */
function resolveParentPageId(relativePath: string, manifest: Manifest): string {
  const parts = relativePath.split('/');
  parts.pop(); // remove filename

  // Walk from deepest folder up to root, looking for a mapped folder
  while (parts.length > 0) {
    const folderPath = parts.join('/');
    if (manifest.folders[folderPath]) {
      return manifest.folders[folderPath];
    }
    parts.pop();
  }

  return manifest.rootPageId;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
