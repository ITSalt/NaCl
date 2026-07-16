#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diagnoseInstallation } from "./installation-doctor-lib.mjs";

const defaultPluginRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function parseArgs(argv) {
  const options = { home: os.homedir(), pluginRoot: defaultPluginRoot };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--home" && argument !== "--plugin-root") {
      throw new Error(`unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`${argument} requires a value`);
    index += 1;
    if (argument === "--home") options.home = path.resolve(value);
    if (argument === "--plugin-root") options.pluginRoot = path.resolve(value);
  }
  return options;
}

try {
  const result = await diagnoseInstallation(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "VERIFIED") process.exitCode = 2;
} catch (error) {
  process.stderr.write(`NaCl installation doctor BLOCKED: ${error.message}\n`);
  process.exitCode = 2;
}
