#!/usr/bin/env node

import { chmodSync, existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { inspectCodexConfig, renderManagedBlock } from "./codex-config-contract.mjs";

function fail(code, message) {
  process.stderr.write(`NACL_CODEX_CONFIG_GUARD: status=BLOCKED code=${code} message=${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--") || index + 1 >= argv.length) fail("ARGUMENT_INVALID", "paired options are required");
    options[value.slice(2)] = argv[++index];
  }
  for (const key of ["project-root", "node", "launcher", "binary", "uri", "database", "phase"]) if (!options[key]) fail("ARGUMENT_MISSING", `--${key} is required`);
  if (!new Set(["preflight", "readback"]).has(options.phase)) fail("ARGUMENT_INVALID", "phase must be preflight or readback");
  for (const key of ["project-root", "node", "launcher", "binary"]) if (!path.isAbsolute(options[key])) fail("CODEX_CONFIG_PATH_INVALID", `--${key} must be absolute`);
  return options;
}

const options = parseArgs(process.argv.slice(2));
const configDir = path.join(path.resolve(options["project-root"]), ".codex");
const filename = path.join(configDir, "config.toml");
if (existsSync(configDir)) {
  const directory = lstatSync(configDir);
  if (!directory.isDirectory() || directory.isSymbolicLink()) fail("CODEX_CONFIG_DIR_UNSAFE", ".codex is not a regular directory");
}
if (!existsSync(filename)) {
  if (options.phase === "readback") fail("CODEX_CONFIG_MISSING", "project config was not created");
  process.stdout.write("NACL_CODEX_CONFIG_GUARD: status=VERIFIED state=absent\n");
  process.exit(0);
}
const metadata = lstatSync(filename);
if (!metadata.isFile() || metadata.isSymbolicLink()) fail("CODEX_CONFIG_UNSAFE", "project config is not a regular file");
const source = readFileSync(filename, "utf8");
if (source.startsWith("\uFEFF")) fail("CODEX_CONFIG_MALFORMED", "UTF-8 BOM is not accepted because unrelated bytes must be preserved");
const inspected = inspectCodexConfig(source, renderManagedBlock(options));
if (inspected.state === "blocked") fail(inspected.code, "existing config was not changed");
if (options.phase === "readback" && inspected.state !== "reusable") fail("CODEX_MCP_CONFIG_MISSING", "managed MCP section was not written");
if (options.phase === "readback") chmodSync(filename, 0o600);
process.stdout.write(`NACL_CODEX_CONFIG_GUARD: status=VERIFIED state=${options.phase === "readback" ? "ready" : inspected.state}\n`);
