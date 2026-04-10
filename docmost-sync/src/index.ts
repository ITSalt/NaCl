#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { join } from 'path';
import { SA_SCOPE, BA_SCOPE } from './config/scopes.js';
import { DocmostClient } from './lib/docmost-client.js';
import { runDryRun } from './modes/dry-run.js';
import { runApply } from './modes/apply.js';
import { runInit } from './modes/init.js';
import { runRebuildManifest } from './modes/rebuild-manifest.js';
import type { ScopeConfig, SyncSummary } from './types.js';

/**
 * Read Docmost config from config.yaml (fallback when CLI args not provided).
 * Returns { spaceId, rootPageId, apiUrl } or nulls if not found.
 */
async function readDocmostConfig(projectDir: string, scope: 'sa' | 'ba'): Promise<{
  spaceId?: string;
  rootPageId?: string;
  apiUrl?: string;
}> {
  try {
    const configPath = join(projectDir, 'config.yaml');
    const content = await readFile(configPath, 'utf-8');
    // Simple YAML parsing for the docmost section (no dependency needed)
    const spaceIdMatch = content.match(new RegExp(`spaces:[\\s\\S]*?${scope}:[\\s\\S]*?space_id:\\s*"([^"]+)"`));
    const rootPageIdMatch = content.match(new RegExp(`spaces:[\\s\\S]*?${scope}:[\\s\\S]*?root_page_id:\\s*"([^"]+)"`));
    const apiUrlMatch = content.match(/api_url:\s*"([^"]+)"/);
    return {
      spaceId: spaceIdMatch?.[1] || undefined,
      rootPageId: rootPageIdMatch?.[1] || undefined,
      apiUrl: apiUrlMatch?.[1] || undefined,
    };
  } catch {
    return {};
  }
}

function parseArgs(argv: string[]): {
  scope: 'sa' | 'ba';
  mode: 'init' | 'apply' | 'dry-run' | 'rebuild-manifest';
  projectDir: string;
  spaceId?: string;
  rootPageId?: string;
  delay: number;
} {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') && i + 1 < argv.length) {
      args[arg.slice(2)] = argv[++i];
    }
  }

  const scope = args['scope'];
  if (scope !== 'sa' && scope !== 'ba') {
    throw new Error('--scope must be "sa" or "ba"');
  }

  const mode = args['mode'];
  if (!['init', 'apply', 'dry-run', 'rebuild-manifest'].includes(mode)) {
    throw new Error('--mode must be one of: init, apply, dry-run, rebuild-manifest');
  }

  const projectDir = args['project-dir'];
  if (!projectDir) {
    throw new Error('--project-dir is required');
  }

  return {
    scope: scope as 'sa' | 'ba',
    mode: mode as 'init' | 'apply' | 'dry-run' | 'rebuild-manifest',
    projectDir,
    spaceId: args['space-id'],
    rootPageId: args['root-page-id'],
    delay: parseInt(args['delay'] || '500', 10),
  };
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs(process.argv);
  } catch (err) {
    const errorSummary: SyncSummary = {
      mode: 'unknown',
      scope: 'sa',
      success: false,
      stats: { created: 0, updated: 0, skipped: 0, deleted: 0, errors: 1, foldersCreated: 0 },
      details: {
        created: [],
        updated: [],
        errors: [{ file: '', error: String(err), retried: false }],
        warnings: [],
      },
      manifest: { path: '', lastSyncCommit: '' },
    };
    console.log(JSON.stringify(errorSummary, null, 2));
    process.exit(1);
  }

  const scopeConfig: ScopeConfig = parsed.scope === 'sa' ? SA_SCOPE : BA_SCOPE;
  let summary: SyncSummary;

  if (parsed.mode === 'dry-run') {
    // No API calls needed
    summary = await runDryRun(parsed.projectDir, scopeConfig);
  } else {
    // Modes that need Docmost API
    // Priority: env vars > config.yaml
    let apiUrl = process.env.DOCMOST_API_URL;
    const email = process.env.DOCMOST_EMAIL;
    const password = process.env.DOCMOST_PASSWORD;

    if (!apiUrl) {
      const configDocmost = await readDocmostConfig(parsed.projectDir, parsed.scope);
      if (configDocmost.apiUrl) {
        apiUrl = configDocmost.apiUrl;
        console.error(`Using apiUrl from config.yaml: ${apiUrl}`);
      }
    }

    if (!apiUrl || !email || !password) {
      const errorSummary: SyncSummary = {
        mode: parsed.mode,
        scope: parsed.scope,
        success: false,
        stats: { created: 0, updated: 0, skipped: 0, deleted: 0, errors: 1, foldersCreated: 0 },
        details: {
          created: [],
          updated: [],
          errors: [{
            file: '',
            error: 'DOCMOST_API_URL, DOCMOST_EMAIL, and DOCMOST_PASSWORD environment variables are required.',
            retried: false,
          }],
          warnings: [],
        },
        manifest: { path: '', lastSyncCommit: '' },
      };
      console.log(JSON.stringify(errorSummary, null, 2));
      process.exit(1);
    }

    const client = new DocmostClient(apiUrl);
    await client.login(email, password);
    console.error('Authenticated with Docmost.');

    switch (parsed.mode) {
      case 'apply':
        summary = await runApply(parsed.projectDir, scopeConfig, client, parsed.delay);
        break;
      case 'init': {
        // Fallback to config.yaml if CLI args not provided
        if (!parsed.spaceId || !parsed.rootPageId) {
          const configDocmost = await readDocmostConfig(parsed.projectDir, parsed.scope);
          if (!parsed.spaceId && configDocmost.spaceId) {
            parsed.spaceId = configDocmost.spaceId;
            console.error(`Using spaceId from config.yaml: ${parsed.spaceId}`);
          }
          if (!parsed.rootPageId && configDocmost.rootPageId) {
            parsed.rootPageId = configDocmost.rootPageId;
            console.error(`Using rootPageId from config.yaml: ${parsed.rootPageId}`);
          }
        }
        if (!parsed.spaceId || !parsed.rootPageId) {
          throw new Error('--space-id and --root-page-id are required for --mode init (or set them in config.yaml → docmost.spaces.[scope])');
        }
        summary = await runInit(parsed.projectDir, scopeConfig, client, parsed.spaceId, parsed.rootPageId, parsed.delay);
        break;
      }
      case 'rebuild-manifest': {
        // Same config.yaml fallback as init
        if (!parsed.spaceId || !parsed.rootPageId) {
          const configDocmost = await readDocmostConfig(parsed.projectDir, parsed.scope);
          if (!parsed.spaceId && configDocmost.spaceId) {
            parsed.spaceId = configDocmost.spaceId;
            console.error(`Using spaceId from config.yaml: ${parsed.spaceId}`);
          }
          if (!parsed.rootPageId && configDocmost.rootPageId) {
            parsed.rootPageId = configDocmost.rootPageId;
            console.error(`Using rootPageId from config.yaml: ${parsed.rootPageId}`);
          }
        }
        if (!parsed.spaceId || !parsed.rootPageId) {
          throw new Error('--space-id and --root-page-id are required for --mode rebuild-manifest (or set them in config.yaml → docmost.spaces.[scope])');
        }
        summary = await runRebuildManifest(parsed.projectDir, scopeConfig, client, parsed.spaceId, parsed.rootPageId);
        break;
      }
      default:
        throw new Error(`Unknown mode: ${parsed.mode}`);
    }
  }

  // Output JSON summary to stdout
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.success ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  const errorSummary: SyncSummary = {
    mode: 'unknown',
    scope: 'sa',
    success: false,
    stats: { created: 0, updated: 0, skipped: 0, deleted: 0, errors: 1, foldersCreated: 0 },
    details: {
      created: [],
      updated: [],
      errors: [{ file: '', error: String(err), retried: false }],
      warnings: [],
    },
    manifest: { path: '', lastSyncCommit: '' },
  };
  console.log(JSON.stringify(errorSummary, null, 2));
  process.exit(1);
});
