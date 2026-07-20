#!/usr/bin/env node

import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inspectCodexConfig, renderManagedBlock } from "./codex-config-contract.mjs";

function fail(code) {
  process.stderr.write(`NACL_CODEX_CONFIG_RESULT: status=BLOCKED code=${code}\n`);
  process.exit(1);
}

const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
  if (!process.argv[index]?.startsWith("--") || index + 1 >= process.argv.length) fail("ARGUMENT_INVALID");
  options[process.argv[index].slice(2)] = process.argv[index + 1];
}
for (const key of ["project-root", "node", "launcher", "binary", "uri", "database"]) if (!options[key]) fail("ARGUMENT_MISSING");
for (const key of ["project-root", "node", "launcher", "binary"]) if (!path.isAbsolute(options[key])) fail("CODEX_CONFIG_PATH_INVALID");
const projectRoot = path.resolve(options["project-root"]);
const configDir = path.join(projectRoot, ".codex");
const filename = path.join(configDir, "config.toml");
if (existsSync(configDir)) {
  const metadata = lstatSync(configDir);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("CODEX_CONFIG_DIR_UNSAFE");
} else {
  mkdirSync(configDir, { mode: 0o700 });
}
let source = "";
if (existsSync(filename)) {
  const metadata = lstatSync(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail("CODEX_CONFIG_UNSAFE");
  source = readFileSync(filename, "utf8");
  if (source.startsWith("\uFEFF")) fail("CODEX_CONFIG_MALFORMED");
}
const block = renderManagedBlock(options);
const inspected = inspectCodexConfig(source, block);
if (inspected.state === "blocked") fail(inspected.code);
if (inspected.state === "reusable") {
  chmodSync(filename, 0o600);
  process.stdout.write("NACL_CODEX_CONFIG_RESULT: status=VERIFIED state=reusable secret=opaque-launcher\n");
  process.exit(0);
}
const separator = source.length === 0 ? "" : source.endsWith("\n\n") ? "" : source.endsWith("\n") ? "\n" : "\n\n";
const output = `${source}${separator}${block}`;
const temporary = `${filename}.nacl-${process.pid}.tmp`;
try {
  writeFileSync(temporary, output, { encoding: "utf8", mode: 0o600, flag: "wx" });
  const current = existsSync(filename) ? readFileSync(filename, "utf8") : "";
  if (current !== source) {
    rmSync(temporary);
    fail("CODEX_CONFIG_CHANGED_DURING_WRITE");
  }
  renameSync(temporary, filename);
  chmodSync(filename, 0o600);
} finally {
  if (existsSync(temporary)) rmSync(temporary);
}
process.stdout.write("NACL_CODEX_CONFIG_RESULT: status=VERIFIED state=written secret=opaque-launcher\n");
