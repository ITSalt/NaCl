import { createHash } from 'crypto';
import { readdir, readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { ScannedFile, ScopeConfig } from '../types.js';
import { resolveTitle } from './title-resolver.js';

/**
 * Scans the docs/ directory for .md files matching the scope patterns,
 * computes SHA-256 content hashes, and resolves titles.
 *
 * Returns a Map keyed by relative path (from docs/).
 */
export async function scanFiles(docsDir: string, scope: ScopeConfig): Promise<Map<string, ScannedFile>> {
  const result = new Map<string, ScannedFile>();
  const allFiles = await walkDir(docsDir);

  for (const absolutePath of allFiles) {
    const relativePath = relative(docsDir, absolutePath);

    // Only .md files
    if (!relativePath.endsWith('.md')) {
      continue;
    }

    // Skip manifest files
    if (relativePath === '.docmost-sync.json' || relativePath === '.docmost-sync-ba.json') {
      continue;
    }

    // Check include/exclude patterns
    if (!matchesScope(relativePath, scope)) {
      continue;
    }

    const rawContent = await readFile(absolutePath, 'utf-8');

    // Skip empty files
    if (!rawContent.trim()) {
      continue;
    }

    // Normalize: trim trailing whitespace per line
    const normalized = normalizeContent(rawContent);
    const contentHash = computeHash(normalized);
    const title = resolveTitle(relativePath, rawContent, scope);

    result.set(relativePath, {
      relativePath,
      absolutePath,
      content: rawContent,
      contentHash,
      title,
    });
  }

  return result;
}

/**
 * Recursively walks a directory and returns all file paths.
 */
async function walkDir(dir: string): Promise<string[]> {
  const files: string[] = [];
  let entries;

  try {
    entries = await readdir(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const fileStat = await stat(fullPath);

    if (fileStat.isDirectory()) {
      const nested = await walkDir(fullPath);
      files.push(...nested);
    } else if (fileStat.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Checks whether a relative path matches the scope's include/exclude patterns.
 *
 * Pattern format examples:
 *   '10-*\/**'  -> matches any path starting with '10-'
 *   '99-meta/**' -> matches any path starting with '99-meta/'
 *   '_index.md'  -> matches exactly '_index.md'
 *   '99-meta/glossary.md' -> matches exactly '99-meta/glossary.md'
 */
function matchesScope(relativePath: string, scope: ScopeConfig): boolean {
  // Check excludes first
  for (const pattern of scope.excludePatterns) {
    if (matchesPattern(relativePath, pattern)) {
      return false;
    }
  }

  // Check includes
  for (const pattern of scope.includePatterns) {
    if (matchesPattern(relativePath, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Simple pattern matching:
 *   - 'XX-*\/**'  -> path starts with 'XX-' (wildcard prefix + recursive)
 *   - 'folder/**' -> path starts with 'folder/'
 *   - 'exact.md'  -> exact match
 *   - 'folder/file.md' -> exact match
 */
function matchesPattern(relativePath: string, pattern: string): boolean {
  // Exact file match (no wildcards)
  if (!pattern.includes('*')) {
    return relativePath === pattern;
  }

  // Pattern like '10-*/**' -> prefix match on '10-'
  if (pattern.includes('-*/**')) {
    const prefix = pattern.replace('-*/**', '-');
    return relativePath.startsWith(prefix);
  }

  // Pattern like '99-meta/**' -> prefix match on '99-meta/'
  if (pattern.endsWith('/**')) {
    const prefix = pattern.replace('/**', '/');
    return relativePath.startsWith(prefix);
  }

  // Pattern like '*.md' -> extension match
  if (pattern.startsWith('*')) {
    const suffix = pattern.substring(1);
    return relativePath.endsWith(suffix);
  }

  return false;
}

/**
 * Normalize content by trimming trailing whitespace from each line.
 */
function normalizeContent(content: string): string {
  return content
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n');
}

/**
 * Compute SHA-256 hash of content.
 */
function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
