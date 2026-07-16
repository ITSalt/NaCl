#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateMatrixReport } from "./codex-plugin-wave1-report.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourcePluginRoot = path.join(repoRoot, "plugins", "nacl");
const sourceMarketplace = path.join(
  repoRoot,
  ".agents",
  "plugins",
  "marketplace.json",
);
const pluginCreatorRoot = path.join(
  os.homedir(),
  ".codex",
  "skills",
  ".system",
  "plugin-creator",
);

const MCP_SERVER = {
  command: "node",
  args: ["./scripts/nacl-spike-mcp.mjs"],
  cwd: ".",
};
const SHAPES = [
  {
    id: "camel-case-companion",
    mcp: { mcpServers: { "nacl-spike": MCP_SERVER } },
  },
  {
    id: "direct-map",
    mcp: { "nacl-spike": MCP_SERVER },
  },
  {
    id: "snake-case-wrapper",
    mcp: { mcp_servers: { "nacl-spike": MCP_SERVER } },
  },
];

function parseArgs(argv) {
  const options = {
    keep: false,
    prepareOnly: false,
    output: null,
    codex: "codex",
    validator: path.join(pluginCreatorRoot, "scripts", "validate_plugin.py"),
    cachebuster: path.join(
      pluginCreatorRoot,
      "scripts",
      "update_plugin_cachebuster.py",
    ),
    marketplaceNameReader: path.join(
      pluginCreatorRoot,
      "scripts",
      "read_marketplace_name.py",
    ),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--keep") options.keep = true;
    else if (argument === "--prepare-only") options.prepareOnly = true;
    else if (
      ["--output", "--codex", "--validator", "--cachebuster", "--marketplace-name-reader"].includes(
        argument,
      )
    ) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--output") options.output = path.resolve(value);
      if (argument === "--codex") options.codex = value;
      if (argument === "--validator") options.validator = path.resolve(value);
      if (argument === "--cachebuster") options.cachebuster = path.resolve(value);
      if (argument === "--marketplace-name-reader") {
        options.marketplaceNameReader = path.resolve(value);
      }
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function execute(command, args, { cwd = repoRoot, env = safeBaseEnv(), input } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    command: [command, ...args],
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
}

function safeBaseEnv() {
  const env = {};
  for (const name of [
    "PATH",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TERM",
    "USER",
    "LOGNAME",
    "SHELL",
  ]) {
    if (typeof process.env[name] === "string") env[name] = process.env[name];
  }
  return env;
}

function isolatedEnv(home, codexHome) {
  return { ...safeBaseEnv(), HOME: home, CODEX_HOME: codexHome };
}

function parseJson(result) {
  if (result.exitCode !== 0 || result.stdout.trim().length === 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

async function sha256(filename) {
  try {
    return createHash("sha256")
      .update(await readFile(filename))
      .digest("hex");
  } catch {
    return null;
  }
}

async function pathExists(filename) {
  try {
    await stat(filename);
    return true;
  } catch {
    return false;
  }
}

async function canonicalPath(filename) {
  if (typeof filename !== "string") return null;
  try {
    return await realpath(filename);
  } catch {
    return null;
  }
}

async function prepareShape(root, shape) {
  const marketplaceRoot = path.join(root, shape.id, "marketplace");
  const pluginRoot = path.join(marketplaceRoot, "plugins", "nacl");
  const marketplaceDestination = path.join(
    marketplaceRoot,
    ".agents",
    "plugins",
    "marketplace.json",
  );
  await mkdir(path.dirname(marketplaceDestination), { recursive: true });
  await mkdir(path.dirname(pluginRoot), { recursive: true });
  await cp(sourceMarketplace, marketplaceDestination);
  await cp(sourcePluginRoot, pluginRoot, { recursive: true });
  await writeFile(
    path.join(pluginRoot, ".mcp.json"),
    `${JSON.stringify(shape.mcp, null, 2)}\n`,
  );
  return { marketplaceRoot, marketplaceDestination, pluginRoot };
}

function invokeTransport(transport, env) {
  if (!transport || transport.type !== "stdio") {
    return {
      command: null,
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "MCP server is not visible as a STDIO transport",
      response: null,
    };
  }
  const requests = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "nacl_spike_health",
        arguments: { echo: "cli-configured-transport" },
      },
    },
  ];
  const result = execute(transport.command, transport.args ?? [], {
    cwd: transport.cwd,
    env,
    input: `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`,
  });
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  let response = null;
  if (lines.length >= 2) {
    try {
      response = JSON.parse(lines.at(-1));
    } catch {
      response = null;
    }
  }
  return { ...result, response };
}

async function scanCache(installedPath) {
  const cache = {
    path: installedPath ?? null,
    canonicalPath: await canonicalPath(installedPath),
    files: [],
    violations: [],
  };
  if (!installedPath) {
    cache.violations.push("no installed cache path");
    return cache;
  }
  try {
    if (!(await stat(installedPath)).isDirectory()) {
      cache.violations.push("installed cache path is not a directory");
      return cache;
    }
  } catch {
    cache.violations.push("installed cache path is unavailable");
    return cache;
  }

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(installedPath, absolutePath);
      if (entry.isDirectory()) await walk(absolutePath);
      else if (entry.isSymbolicLink()) cache.violations.push(`symbolic link: ${relativePath}`);
      else if (entry.isFile()) {
        cache.files.push(relativePath);
        const content = await readFile(absolutePath, "utf8");
        if (/\/Users\/[^/]+\//.test(content)) {
          cache.violations.push(`developer path: ${relativePath}`);
        }
        if (/(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}/.test(content)) {
          cache.violations.push(`secret-like token: ${relativePath}`);
        }
      }
    }
  }
  await walk(installedPath);
  return cache;
}

function findSpikeTransport(mcpListResult) {
  const parsed = parseJson(mcpListResult);
  const entry = Array.isArray(parsed)
    ? parsed.find((candidate) => candidate.name === "nacl-spike")
    : null;
  return entry?.transport ?? null;
}

async function runShape(root, shape, options) {
  const prepared = await prepareShape(root, shape);
  const shapeRoot = path.join(root, shape.id);
  const home = path.join(shapeRoot, "home");
  const codexHome = path.join(shapeRoot, "codex-home");
  await mkdir(home, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  const cliEnv = isolatedEnv(home, codexHome);
  const result = {
    shape: shape.id,
    shapeRoot,
    shapeRootCanonical: await canonicalPath(shapeRoot),
    home,
    homeCanonical: await canonicalPath(home),
    codexHome,
    codexHomeCanonical: await canonicalPath(codexHome),
    environment: { HOME: cliEnv.HOME, CODEX_HOME: cliEnv.CODEX_HOME },
    marketplaceRoot: prepared.marketplaceRoot,
    validator: execute("python3", [options.validator, prepared.pluginRoot], {
      env: safeBaseEnv(),
    }),
    marketplaceName: execute("python3", [
      options.marketplaceNameReader,
      "--marketplace-path",
      prepared.marketplaceDestination,
    ], { env: safeBaseEnv() }),
  };
  if (options.prepareOnly) return result;

  result.marketplaceAdd = execute(
    options.codex,
    ["plugin", "marketplace", "add", prepared.marketplaceRoot, "--json"],
    { env: cliEnv },
  );
  result.marketplaceList = execute(
    options.codex,
    ["plugin", "marketplace", "list", "--json"],
    { env: cliEnv },
  );
  result.availableBeforeInstall = execute(
    options.codex,
    ["plugin", "list", "--available", "--json"],
    { env: cliEnv },
  );
  result.pluginAdd = execute(
    options.codex,
    ["plugin", "add", "nacl@personal", "--json"],
    { env: cliEnv },
  );
  const addJson = parseJson(result.pluginAdd);
  result.installedPath = addJson?.installedPath ?? null;
  result.installedPathCanonical = await canonicalPath(result.installedPath);
  result.pluginList = execute(
    options.codex,
    ["plugin", "list", "--json"],
    { env: cliEnv },
  );
  result.mcpList = execute(options.codex, ["mcp", "list", "--json"], {
    env: cliEnv,
  });
  result.transportInvocation = invokeTransport(
    findSpikeTransport(result.mcpList),
    cliEnv,
  );
  result.cache = await scanCache(result.installedPath);

  const unavailableRoot = `${prepared.pluginRoot}.unavailable`;
  await rename(prepared.pluginRoot, unavailableRoot);
  result.sourceUnavailable = true;
  result.sourceProbe = {
    sourceExists: await pathExists(prepared.pluginRoot),
    unavailableExists: await pathExists(unavailableRoot),
  };
  result.mcpListWithoutSource = execute(
    options.codex,
    ["mcp", "list", "--json"],
    { env: cliEnv },
  );
  result.transportInvocationWithoutSource = invokeTransport(
    findSpikeTransport(result.mcpListWithoutSource),
    cliEnv,
  );

  if (shape.id === "camel-case-companion") {
    await rename(unavailableRoot, prepared.pluginRoot);
    result.sourceUnavailable = false;
    result.cachebuster = execute(
      "python3",
      [options.cachebuster, prepared.pluginRoot],
      { env: safeBaseEnv() },
    );
    try {
      const updatedManifest = JSON.parse(
        await readFile(
          path.join(prepared.pluginRoot, ".codex-plugin", "plugin.json"),
          "utf8",
        ),
      );
      result.updatedVersion = updatedManifest.version ?? null;
      result.updatedManifestError = null;
    } catch {
      result.updatedVersion = null;
      result.updatedManifestError = "updated plugin manifest is unreadable or invalid";
    }
    result.reinstall = execute(
      options.codex,
      ["plugin", "add", "nacl@personal", "--json"],
      { env: cliEnv },
    );
    result.reinstallMcpList = execute(
      options.codex,
      ["mcp", "list", "--json"],
      { env: cliEnv },
    );
    result.reinstallTransportInvocation = invokeTransport(
      findSpikeTransport(result.reinstallMcpList),
      cliEnv,
    );
    const reinstallJson = parseJson(result.reinstall);
    result.reinstalledPath = reinstallJson?.installedPath ?? null;
    result.reinstalledPathCanonical = await canonicalPath(result.reinstalledPath);
    result.reinstalledCache = await scanCache(result.reinstalledPath);
    await rename(prepared.pluginRoot, unavailableRoot);
    result.sourceUnavailable = true;
    result.reinstallSourceProbe = {
      sourceExists: await pathExists(prepared.pluginRoot),
      unavailableExists: await pathExists(unavailableRoot),
    };
    result.reinstallMcpListWithoutSource = execute(
      options.codex,
      ["mcp", "list", "--json"],
      { env: cliEnv },
    );
    result.reinstallTransportInvocationWithoutSource = invokeTransport(
      findSpikeTransport(result.reinstallMcpListWithoutSource),
      cliEnv,
    );
  }

  result.pluginRemove = execute(
    options.codex,
    ["plugin", "remove", "nacl@personal", "--json"],
    { env: cliEnv },
  );
  result.pluginListAfterRemove = execute(
    options.codex,
    ["plugin", "list", "--json"],
    { env: cliEnv },
  );
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workRoot = await mkdtemp(
    path.join(os.tmpdir(), "nacl-codex-plugin-wave1-matrix-"),
  );
  const repoHeadCommand = execute("git", ["rev-parse", "HEAD"], {
    env: safeBaseEnv(),
  });
  let sourceVersion = null;
  try {
    const sourceManifest = JSON.parse(
      await readFile(
        path.join(sourcePluginRoot, ".codex-plugin", "plugin.json"),
        "utf8",
      ),
    );
    sourceVersion = sourceManifest.version ?? null;
  } catch {
    // The pure report assertion records a sourceVersion failure.
  }
  const report = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    repoHeadCommand,
    repoHead: repoHeadCommand.stdout.trim(),
    codexVersion: execute(options.codex, ["--version"], { env: safeBaseEnv() }),
    sourceVersion,
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    workRoot,
    workRootCanonical: await canonicalPath(workRoot),
    helperHashes: {
      validator: await sha256(options.validator),
      cachebuster: await sha256(options.cachebuster),
      marketplaceNameReader: await sha256(options.marketplaceNameReader),
    },
    shapes: [],
  };
  try {
    for (const shape of SHAPES) {
      report.shapes.push(await runShape(workRoot, shape, options));
    }
    Object.assign(
      report,
      evaluateMatrixReport(report, { prepareOnly: options.prepareOnly }),
    );
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (options.output) await writeFile(options.output, serialized);
    process.stdout.write(serialized);
    if (report.overallStatus === "FAILED") {
      const preview = report.failures.slice(0, 3).join("; ");
      process.stderr.write(
        `Matrix FAILED (${report.failures.length} checks): ${preview}\n`,
      );
      process.exitCode = 1;
    }
  } finally {
    if (!options.keep) await rm(workRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
