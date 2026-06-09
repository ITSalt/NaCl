// Regression guard for the symlink-invocation bug: skills are installed as symlinks
// (~/.claude/skills/<skill> → repo/<skill>), so they invoke a tool's CLI through a
// symlinked path. A naive `import.meta.url === file://${process.argv[1]}` main-check
// FAILS there (import.meta.url is the realpath, argv[1] is the symlink) → the CLI block
// never runs → the tool prints NOTHING and the skill silently gets no result.
// This test execs each .mjs tool through a temporary symlink and asserts real output.
// Run: node --test nacl-tl-verify-code/scripts/symlink-cli.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { symlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const TOOLS = [
  { path: 'nacl-tl-plan/scripts/wave-plan.mjs', args: ['{"ucs":[{"id":"UC001","depends_on":[]}]}'], expect: 'UC001-BE' },
  { path: 'nacl-sa-validate/scripts/classify-findings.mjs', args: ['{"findings":[{"check":"L1.1","severity":"CRITICAL"}]}'], expect: '"overall": "FAIL"' },
  { path: 'nacl-ba-sync/scripts/nacl-ids.mjs', args: ['workflow-step', '1', 'BP-001'], expect: 'BP-001-S01' },
  { path: 'nacl-tl-verify-code/scripts/classify-status.mjs',
    args: ['{"staticFail":false,"scriptsTestMissing":false,"emptyTestStubs":false,"runnerCouldNotExecute":false,"testsCollected":42,"baselineResolved":true,"newFailures":0,"postfixFailures":0,"coverageGap":false,"uiChanges":false}'],
    expect: 'PASS' },
];

for (const tool of TOOLS) {
  test(`CLI runs through a symlink: ${tool.path}`, () => {
    const real = join(REPO, tool.path);
    const dir = mkdtempSync(join(tmpdir(), 'nacl-symlink-'));
    const link = join(dir, 'tool.mjs'); // a DIFFERENT name → only realpath-comparison passes
    symlinkSync(real, link);
    try {
      const out = execFileSync('node', [link, ...tool.args], { encoding: 'utf8' });
      assert.ok(out.trim().length > 0, `${tool.path}: symlinked CLI produced NO output (the bug)`);
      assert.ok(out.includes(tool.expect), `${tool.path}: expected ${JSON.stringify(tool.expect)} in output`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
