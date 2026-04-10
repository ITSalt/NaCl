export interface Manifest {
  spaceId: string;
  rootPageId: string;
  lastSyncCommit: string;
  lastReviewTimestamp?: string;
  pages: Record<string, ManifestPage>;
  folders: Record<string, string>;
}

export interface ManifestPage {
  pageId: string;
  parentPageId: string;
  contentHash: string;
}

export interface ScannedFile {
  relativePath: string;
  absolutePath: string;
  content: string;
  contentHash: string;
  title: string;
}

export interface DiffResult {
  creates: ScannedFile[];
  updates: Array<ScannedFile & { pageId: string }>;
  skips: string[];
  warnings: Array<{ file: string; pageId: string; warning: string }>;
}

export interface PublishResult {
  created: Array<{ file: string; pageId: string; title: string }>;
  updated: Array<{ file: string; pageId: string; title: string }>;
  errors: Array<{ file: string; error: string; retried: boolean }>;
}

export interface SyncSummary {
  mode: string;
  scope: string;
  success: boolean;
  stats: {
    created: number;
    updated: number;
    skipped: number;
    deleted: number;
    errors: number;
    foldersCreated: number;
  };
  details: {
    created: Array<{ file: string; pageId: string; title: string }>;
    updated: Array<{ file: string; pageId: string; title: string }>;
    errors: Array<{ file: string; error: string; retried: boolean }>;
    warnings: Array<{ file: string; pageId?: string; warning: string }>;
  };
  manifest: {
    path: string;
    lastSyncCommit: string;
  };
}

export interface ScopeConfig {
  name: 'sa' | 'ba';
  manifestFile: string;
  includePatterns: string[];
  excludePatterns: string[];
  folderTitleMap: Record<string, string>;
  specialFileTitles: Record<string, string>;
}
