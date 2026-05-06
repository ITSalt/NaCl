import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function readGitSha(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      cwd: here,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 1000,
    }).trim();
    if (!sha) return 'unknown';
    try {
      const status = execSync('git status --porcelain', {
        cwd: here,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
        timeout: 1000,
      });
      return status.length > 0 ? `${sha}-dirty` : sha;
    } catch {
      return sha;
    }
  } catch {
    return 'unknown';
  }
}

const APP_VERSION = readPackageVersion();
const APP_GIT_SHA = readGitSha();
const APP_BUILT_AT = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  // Bake build identity + Excalidraw's required NODE_ENV polyfill at build time.
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'development'),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_GIT_SHA__: JSON.stringify(APP_GIT_SHA),
    __APP_BUILT_AT__: JSON.stringify(APP_BUILT_AT),
  },
  server: {
    port: 3582,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3583',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3583',
        ws: true,
      },
    },
  },
});
