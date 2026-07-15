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
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePluginRoot = path.join(repoRoot, "plugins", "nacl");
const sourceMarketplace = path.join(repoRoot, ".agents", "plugins", "marketplace.json");

function safeEnv(home, codexHome) {
  const env = { HOME: home, CODEX_HOME: codexHome };
  for (const name of ["PATH", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "SHELL"]) {
    if (typeof process.env[name] === "string") env[name] = process.env[name];
  }
  return env;
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error?.code === "ENOENT") {
    const error = new Error(`${command} is not installed`);
    error.blocked = true;
    throw error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}: ${result.stderr || result.stdout}`,
    );
  }
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
}

function parseJson(result) {
  return JSON.parse(result.stdout);
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function skillHashes(root) {
  const result = {};
  const entries = await readdir(path.join(root, "skills"), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const bytes = await readFile(path.join(root, "skills", entry.name, "SKILL.md"));
    result[entry.name] = createHash("sha256").update(bytes).digest("hex");
  }
  return Object.fromEntries(Object.entries(result).sort());
}

function findTransport(mcpList) {
  const parsed = parseJson(mcpList);
  const entry = Array.isArray(parsed)
    ? parsed.find((candidate) => candidate.name === "nacl")
    : null;
  if (entry?.transport?.type !== "stdio") throw new Error("nacl STDIO transport is unavailable");
  return entry.transport;
}

function invokeCacheContract(transport, env, projectRoot) {
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
        name: "nacl_installation_doctor",
        arguments: {},
        _meta: { progressToken: "wave2-cli-cache" },
      },
    },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "nacl_graph_local_init",
        arguments: {
          project_id: "wave6-cache-project",
          project_root: projectRoot,
          confirmation: "NOT_CONFIRMED",
        },
      },
    },
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "nacl_agent_profiles_plan",
        arguments: { project_root: projectRoot },
      },
    },
  ];
  const result = run(transport.command, transport.args ?? [], {
    cwd: transport.cwd,
    env,
    input: `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`,
  });
  const responses = result.stdout.trim().split("\n").filter(Boolean).map(JSON.parse);
  const structured = (id, label) => {
    const call = responses.find((response) => response.id === id);
    if (!call?.result?.structuredContent) throw new Error(`${label} response is missing`);
    return call.result.structuredContent;
  };
  return {
    diagnosis: structured(2, "doctor"),
    lifecycleInit: structured(3, "local init"),
    profilePlan: structured(4, "agent profile plan"),
  };
}

function invokeCachedTools(transport, env, calls) {
  const requests = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    ...calls.map((call, index) => ({
      jsonrpc: "2.0",
      id: index + 10,
      method: "tools/call",
      params: { name: call.name, arguments: call.arguments },
    })),
  ];
  const result = run(transport.command, transport.args ?? [], {
    cwd: transport.cwd,
    env,
    input: `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`,
  });
  const responses = result.stdout.trim().split("\n").filter(Boolean).map(JSON.parse);
  return calls.map((_, index) => {
    const response = responses.find((candidate) => candidate.id === index + 10);
    if (!response?.result?.structuredContent) throw new Error(`cached MCP call ${index} is missing`);
    return response.result.structuredContent;
  });
}

async function main() {
  const outputArgument = process.argv.indexOf("--output");
  const output = outputArgument >= 0 ? path.resolve(process.argv[outputArgument + 1] ?? "") : null;
  if (outputArgument >= 0 && !process.argv[outputArgument + 1]) throw new Error("--output requires a path");
  const workRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-wave2-cli-e2e-"));
  const marketplaceRoot = path.join(workRoot, "marketplace");
  const marketplacePlugin = path.join(marketplaceRoot, "plugins", "nacl");
  const marketplaceManifest = path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json");
  const home = path.join(workRoot, "home");
  const codexHome = path.join(workRoot, "codex-home");
  const report = {
    schemaVersion: 1,
    status: "UNVERIFIED",
    sourceUnavailable: false,
    pluginVersion: null,
    installedPath: null,
    executionLocation: null,
    entrySkillCount: null,
    modelBackedRouting: {
      status: "NOT_RUN",
      reason: "isolated CODEX_HOME does not inherit credentials and this gate does not call codex exec",
    },
    workflowCacheContract: null,
  };

  try {
    await Promise.all([
      mkdir(path.dirname(marketplaceManifest), { recursive: true }),
      mkdir(path.dirname(marketplacePlugin), { recursive: true }),
      mkdir(home, { recursive: true }),
      mkdir(codexHome, { recursive: true }),
    ]);
    await cp(sourceMarketplace, marketplaceManifest);
    await cp(sourcePluginRoot, marketplacePlugin, { recursive: true });
    const marketplace = JSON.parse(await readFile(sourceMarketplace, "utf8"));
    if (typeof marketplace.name !== "string" || marketplace.name.length === 0) {
      throw new Error("repo marketplace is missing a name");
    }
    const selector = `nacl@${marketplace.name}`;
    const manifest = JSON.parse(
      await readFile(path.join(sourcePluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
    );
    report.pluginVersion = manifest.version;
    const env = safeEnv(home, codexHome);

    const version = run("codex", ["--version"], { cwd: repoRoot, env });
    report.codexVersion = version.stdout.trim();
    run("codex", ["plugin", "marketplace", "add", marketplaceRoot, "--json"], {
      cwd: repoRoot,
      env,
    });
    const add = parseJson(
      run("codex", ["plugin", "add", selector, "--json"], {
        cwd: repoRoot,
        env,
      }),
    );
    if (typeof add.installedPath !== "string") throw new Error("Codex did not return installedPath");
    const [canonicalInstall, canonicalCodexHome] = await Promise.all([
      realpath(add.installedPath),
      realpath(codexHome),
    ]);
    if (!isInside(path.join(canonicalCodexHome, "plugins", "cache"), canonicalInstall)) {
      throw new Error("installed plugin escaped the isolated CODEX_HOME cache");
    }
    report.installedPath = canonicalInstall;

    const sourceUnavailable = `${marketplacePlugin}.unavailable`;
    await rename(marketplacePlugin, sourceUnavailable);
    report.sourceUnavailable = true;

    const mcpList = run("codex", ["mcp", "list", "--json"], { cwd: repoRoot, env });
    const projectRoot = path.join(workRoot, "workflow-project");
    await mkdir(projectRoot);
    const transport = findTransport(mcpList);
    const cacheContract = invokeCacheContract(transport, env, projectRoot);
    const { diagnosis, lifecycleInit, profilePlan } = cacheContract;
    if (diagnosis.mode !== "plugin-only" || diagnosis.status !== "VERIFIED") {
      throw new Error(`cached doctor returned ${diagnosis.mode}/${diagnosis.status}`);
    }
    if (diagnosis.executionLocation !== "installed-cache") {
      throw new Error(`unexpected execution location: ${diagnosis.executionLocation}`);
    }
    if (diagnosis.pluginVersion !== manifest.version) {
      throw new Error("cached MCP version differs from the installed manifest");
    }
    report.executionLocation = diagnosis.executionLocation;
    if (lifecycleInit.status !== "BLOCKED" || lifecycleInit.code !== "CONFIRMATION_REQUIRED") {
      throw new Error(`cached lifecycle confirmation boundary returned ${lifecycleInit.status}/${lifecycleInit.code}`);
    }
    if (profilePlan.status !== "VERIFIED" || profilePlan.code !== "AGENT_PROFILE_PLAN_READY") {
      throw new Error(`cached profile plan returned ${profilePlan.status}/${profilePlan.code}`);
    }
    if (!Array.isArray(profilePlan.entries) || profilePlan.entries.length !== 5) {
      throw new Error("cached profile plan did not expose five packaged templates");
    }
    const [profileApply] = invokeCachedTools(transport, env, [{
      name: "nacl_agent_profiles_apply",
      arguments: {
        project_root: projectRoot,
        plan_token: profilePlan.planToken,
        confirmation: profilePlan.confirmation,
      },
    }]);
    if (profileApply.status !== "VERIFIED" || profileApply.code !== "AGENT_PROFILES_INSTALLED") {
      throw new Error(`cached profile apply returned ${profileApply.status}/${profileApply.code}`);
    }
    const conflictPath = profileApply.entries[0].destination;
    await writeFile(conflictPath, "name = \"user-owned\"\n");
    const [profileConflict, conflictApply] = invokeCachedTools(transport, env, [
      { name: "nacl_agent_profiles_plan", arguments: { project_root: projectRoot } },
      {
        name: "nacl_agent_profiles_apply",
        arguments: {
          project_root: projectRoot,
          plan_token: profileApply.planToken,
          confirmation: `INSTALL_AGENT_PROFILES:${profileApply.planToken}`,
        },
      },
    ]);
    if (profileConflict.status !== "BLOCKED" || profileConflict.code !== "AGENT_PROFILE_CONFLICT") {
      throw new Error(`cached profile conflict returned ${profileConflict.status}/${profileConflict.code}`);
    }
    if (conflictApply.status !== "BLOCKED" || conflictApply.code !== "AGENT_PROFILE_CONFLICT") {
      throw new Error(`cached conflict apply returned ${conflictApply.status}/${conflictApply.code}`);
    }
    if (await readFile(conflictPath, "utf8") !== "name = \"user-owned\"\n") {
      throw new Error("cached conflict apply overwrote a user-owned profile");
    }
    report.workflowCacheContract = {
      lifecycleInit: { status: lifecycleInit.status, code: lifecycleInit.code },
      profilePlan: { status: profilePlan.status, code: profilePlan.code, entryCount: profilePlan.entries.length },
      profileApply: { status: profileApply.status, code: profileApply.code, changedCount: profileApply.changed.length },
      profileConflict: { status: profileConflict.status, code: profileConflict.code, preserved: true },
    };

    const [sourceHashes, cacheHashes] = await Promise.all([
      skillHashes(sourcePluginRoot),
      skillHashes(canonicalInstall),
    ]);
    if (JSON.stringify(sourceHashes) !== JSON.stringify(cacheHashes)) {
      throw new Error("installed cache entry skills differ from the source archive");
    }
    report.entrySkillCount = Object.keys(cacheHashes).length;
    if (report.entrySkillCount !== 10) throw new Error("installed cache must contain ten entry skills");

    const listed = parseJson(
      run("codex", ["plugin", "list", "--json"], { cwd: repoRoot, env }),
    );
    const installed = Array.isArray(listed?.installed)
      ? listed.installed.find((candidate) => candidate.pluginId === selector)
      : null;
    if (!installed || installed.version !== manifest.version || installed.enabled !== true) {
      throw new Error("codex plugin list does not show the enabled nacl candidate");
    }

    run("codex", ["plugin", "remove", selector, "--json"], {
      cwd: repoRoot,
      env,
    });
    report.status = "VERIFIED";
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (output) await writeFile(output, serialized);
    process.stdout.write(serialized);
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const status = error.blocked ? "BLOCKED" : "FAILED";
  process.stderr.write(`Status: ${status}\nReason: ${error.message}\n`);
  process.exitCode = error.blocked ? 2 : 1;
});
