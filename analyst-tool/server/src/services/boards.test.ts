/**
 * boards service tests — focused on edge cases that were tripping up the
 * production server (e.g. listBoards on a non-existent directory).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let parentDir: string;
const savedHome = process.env['NACL_BOARDS_DIR'];

before(async () => {
  parentDir = await mkdtemp(join(tmpdir(), 'nacl-boards-test-'));
});

after(async () => {
  await rm(parentDir, { recursive: true, force: true });
  if (savedHome !== undefined) {
    process.env['NACL_BOARDS_DIR'] = savedHome;
  } else {
    delete process.env['NACL_BOARDS_DIR'];
  }
});

describe('listBoards: missing directory', () => {
  it('returns empty array when boardsDir does not exist (no 500)', async () => {
    process.env['NACL_BOARDS_DIR'] = join(parentDir, 'this-does-not-exist');
    const { listBoards } = await import('./boards.js');
    const result = await listBoards();
    assert.deepEqual(result, []);
  });
});
