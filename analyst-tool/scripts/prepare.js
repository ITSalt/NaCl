// Cross-platform `prepare` hook (Windows / macOS / Unix).
//
// `prepare` runs on every `npm install`, including when this package is
// pulled in as a dependency in an environment without the full dev toolchain.
// We attempt the build, but a build failure must never abort the install —
// so we always exit 0 regardless of the build result.
//
// Implemented in Node (not shell) to avoid platform-specific syntax such as
// `2>/dev/null` or `|| true`, which break under cmd.exe on Windows.

import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: true,
});

if (result.status !== 0) {
  console.warn('[prepare] build skipped or failed — continuing install anyway.');
}

process.exit(0);
