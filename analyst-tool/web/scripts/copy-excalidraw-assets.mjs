// Copy Excalidraw's runtime assets (fonts, vendor chunk, locales) into web/public
// so they are served from our own origin instead of the unpkg.com CDN.
//
// Why: Excalidraw lazily loads fonts from
//   window.EXCALIDRAW_ASSET_PATH || "https://unpkg.com/@excalidraw/excalidraw@<ver>/dist/"
// The default CDN is blocked by browser Tracking Prevention (and by any
// offline / locked-down environment), which leaves text invisible (FOIT —
// the web font never loads, so glyphs are never painted). We set
// EXCALIDRAW_ASSET_PATH="/" in index.html and host the assets locally here.
//
// Runs on predev/prebuild. Node-only (no shell) so it works on Windows/macOS/Unix.

import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(webRoot, '..');

// npm workspaces hoist deps to the repo root, but a local install may keep a
// nested copy — check both.
const distCandidates = [
  join(repoRoot, 'node_modules', '@excalidraw', 'excalidraw', 'dist'),
  join(webRoot, 'node_modules', '@excalidraw', 'excalidraw', 'dist'),
];
const distDir = distCandidates.find((p) => existsSync(p));
if (!distDir) {
  console.error('[copy-excalidraw-assets] @excalidraw/excalidraw not found in node_modules — run npm install first.');
  process.exit(1);
}

// Both folders exist in the package: production build requests `excalidraw-assets`,
// the dev build requests `excalidraw-assets-dev`. Copy whichever are present.
const folders = ['excalidraw-assets', 'excalidraw-assets-dev'];
const publicDir = join(webRoot, 'public');
await mkdir(publicDir, { recursive: true });

let copied = 0;
for (const folder of folders) {
  const src = join(distDir, folder);
  if (!existsSync(src)) continue;
  await cp(src, join(publicDir, folder), { recursive: true });
  console.log(`[copy-excalidraw-assets] ${folder} -> public/${folder}`);
  copied++;
}

if (copied === 0) {
  console.error('[copy-excalidraw-assets] no asset folders found under', distDir);
  process.exit(1);
}
