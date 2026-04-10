import { ScopeConfig } from '../types.js';

/**
 * Resolves the display title for a document page.
 *
 * Priority:
 *   1. specialFileTitles map (for _index.md, _domain-model.md, etc.)
 *   2. YAML frontmatter "title" field
 *   3. First # heading in the content
 *   4. Filename converted from kebab-case to Title Case
 */
export function resolveTitle(relativePath: string, content: string, scope: ScopeConfig): string {
  const filename = relativePath.split('/').pop() || '';

  // 1. Check special titles
  if (scope.specialFileTitles[filename]) {
    return scope.specialFileTitles[filename];
  }

  // 2. Check YAML frontmatter
  const frontmatterTitle = extractFrontmatterTitle(content);
  if (frontmatterTitle) {
    return frontmatterTitle;
  }

  // 3. Check first heading
  const headingTitle = extractFirstHeading(content);
  if (headingTitle) {
    return headingTitle;
  }

  // 4. Fallback: filename to Title Case
  return filenameToTitle(filename);
}

function extractFrontmatterTitle(content: string): string | null {
  if (!content.startsWith('---')) {
    return null;
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return null;
  }

  const frontmatter = content.substring(3, endIndex);
  const match = frontmatter.match(/^title:\s*(.+)$/m);
  if (!match) {
    return null;
  }

  // Strip surrounding quotes if present
  let title = match[1].trim();
  if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
    title = title.slice(1, -1);
  }

  return title || null;
}

function extractFirstHeading(content: string): string | null {
  // Skip past frontmatter if present
  let searchContent = content;
  if (content.startsWith('---')) {
    const endIndex = content.indexOf('---', 3);
    if (endIndex !== -1) {
      searchContent = content.substring(endIndex + 3);
    }
  }

  const match = searchContent.match(/^# (.+)$/m);
  return match ? match[1].trim() : null;
}

function filenameToTitle(filename: string): string {
  const name = filename.replace(/\.md$/, '');
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
