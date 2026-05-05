#!/usr/bin/env node
// Wave 6.B: cross-platform browser opener — no external deps.
import { spawn } from 'node:child_process';

/**
 * Opens `url` in the user's default browser.
 * Fires and forgets — errors are logged but not thrown.
 * @param {string} url
 */
export function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  let args;

  if (platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    // Linux / FreeBSD / etc.
    cmd = 'xdg-open';
    args = [url];
  }

  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.unref();
  child.on('error', (err) => {
    process.stderr.write(`[nacl-analyst-tool] Could not open browser: ${err.message}\n`);
  });
}
