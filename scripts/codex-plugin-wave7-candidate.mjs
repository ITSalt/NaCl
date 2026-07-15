#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePluginRoot = path.join(repoRoot, "plugins", "nacl");
const sourceMarketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");
const auditedLegacyBase = "d98f7399e7b9941341421321407ad27ee895d221";
const auditedLegacyHashes = new Map(Object.entries({
  "nacl-core": "2e4d35d3414d4483de4ff3430344f4a711d1fe99da78b906fcabcae251f766b2",
  "nacl-goal": "ff953ce107f15ee16553afc8fa2a32a44d4096a83dd46403f2a840d78d90158a",
  "nacl-migrate-sa": "1af1f87724ac5a2298578959ffa26d8d028eacf47bfa1bc612afb31fae4cfe65",
  "nacl-tl-core": "faab6033e052c4702e5a89b86b2e66893eb40a7522a9278c2b26fa89db632bdb",
}));
const expectedSkills = [
  "nacl-ba",
  "nacl-diagnose",
  "nacl-fix",
  "nacl-goal",
  "nacl-init",
  "nacl-migrate",
  "nacl-publish",
  "nacl-sa",
  "nacl-tl",
  "nacl-verify",
];
const expectedTools = [
  "nacl_installation_doctor",
  "nacl_project_resolve",
  "nacl_project_migrate_identity",
  "nacl_project_register_root",
  "nacl_legacy_symlinks_plan",
  "nacl_legacy_symlinks_apply",
  "nacl_graph_local_init",
  "nacl_graph_local_start",
  "nacl_graph_local_doctor",
  "nacl_agent_profiles_plan",
  "nacl_agent_profiles_apply",
  "nacl_graph_health",
  "nacl_graph_schema_status",
  "nacl_graph_read",
  "nacl_graph_apply_migrations",
  "nacl_graph_write_canary",
  "nacl_graph_derive_worker_identity",
  "nacl_graph_claim_resource",
  "nacl_graph_heartbeat_resource",
  "nacl_graph_release_resource",
  "nacl_graph_handoff_resource",
  "nacl_graph_mutate_resource",
  "nacl_graph_allocate_id",
  "nacl_graph_bootstrap_admin",
  "nacl_graph_set_membership",
];

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
    timeout: options.timeout ?? 180_000,
  });
  if (result.error?.code === "ENOENT") {
    const error = new Error(`${command} is not installed`);
    error.blocked = true;
    throw error;
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}: ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function parseJson(result) {
  return JSON.parse(result.stdout);
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function writeJson(filename, value) {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
}

async function directoryDigest(root) {
  const hash = createHash("sha256");
  let fileCount = 0;
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      const metadata = await lstat(filename);
      if (metadata.isSymbolicLink()) throw new Error(`candidate contains a symbolic link: ${filename}`);
      if (metadata.isDirectory()) {
        await walk(filename);
      } else if (metadata.isFile()) {
        const relative = path.relative(root, filename).split(path.sep).join("/");
        hash.update(relative);
        hash.update("\0");
        hash.update(await readFile(filename));
        hash.update("\0");
        fileCount += 1;
      } else {
        throw new Error(`candidate contains an unsupported entry: ${filename}`);
      }
    }
  }
  await walk(root);
  return { sha256: hash.digest("hex"), fileCount };
}

async function stagePlugin(sourceRoot, version) {
  await rm(sourceRoot, { recursive: true, force: true });
  await cp(sourcePluginRoot, sourceRoot, { recursive: true });
  const manifestPath = path.join(sourceRoot, ".codex-plugin", "plugin.json");
  const manifest = await readJson(manifestPath);
  manifest.version = version;
  await writeJson(manifestPath, manifest);
}

function installedRecord(env, selector) {
  const listed = parseJson(run("codex", ["plugin", "list", "--json"], { cwd: repoRoot, env }));
  return Array.isArray(listed?.installed)
    ? listed.installed.find((candidate) => candidate.pluginId === selector)
    : null;
}

async function install(env, selector, expectedVersion, codexHome) {
  const add = parseJson(
    run("codex", ["plugin", "add", selector, "--json"], { cwd: repoRoot, env }),
  );
  if (typeof add.installedPath !== "string") throw new Error("Codex did not return installedPath");
  const [installedPath, canonicalCodexHome] = await Promise.all([
    realpath(add.installedPath),
    realpath(codexHome),
  ]);
  if (!isInside(path.join(canonicalCodexHome, "plugins", "cache"), installedPath)) {
    throw new Error("installed candidate escaped the disposable CODEX_HOME cache");
  }
  const manifest = await readJson(path.join(installedPath, ".codex-plugin", "plugin.json"));
  const listed = installedRecord(env, selector);
  if (
    manifest.version !== expectedVersion ||
    listed?.version !== expectedVersion ||
    listed?.enabled !== true
  ) {
    throw new Error(`installed version mismatch: expected ${expectedVersion}`);
  }
  return installedPath;
}

function findTransport(env) {
  const listed = parseJson(run("codex", ["mcp", "list", "--json"], { cwd: repoRoot, env }));
  const server = Array.isArray(listed) ? listed.find((candidate) => candidate.name === "nacl") : null;
  if (server?.transport?.type !== "stdio") throw new Error("installed NaCl STDIO transport is unavailable");
  return server.transport;
}

function invoke(transport, env, calls = []) {
  const requests = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ...calls.map((call, index) => ({
      jsonrpc: "2.0",
      id: index + 10,
      method: "tools/call",
      params: { name: call.name, arguments: call.arguments ?? {}, _meta: { progressToken: `wave7-${index}` } },
    })),
  ];
  const result = run(transport.command, transport.args ?? [], {
    cwd: transport.cwd,
    env,
    input: `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`,
  });
  const responses = result.stdout.trim().split("\n").filter(Boolean).map(JSON.parse);
  const byId = (id) => {
    const response = responses.find((candidate) => candidate.id === id);
    if (!response || response.error) throw new Error(`MCP response ${id} failed: ${JSON.stringify(response)}`);
    return response.result;
  };
  return {
    serverInfo: byId(1).serverInfo,
    tools: byId(2).tools,
    calls: calls.map((_, index) => {
      const resultForCall = byId(index + 10);
      if (!resultForCall.structuredContent) throw new Error(`MCP call ${index} lacks structuredContent`);
      return resultForCall.structuredContent;
    }),
  };
}

async function skillInventory(pluginRoot) {
  const entries = await readdir(path.join(pluginRoot, "skills"), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1] ?? "") : null;
  if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw new Error("--output requires a path");

  const [sourceManifest, sourceMarketplace, sourcePackageIndex] = await Promise.all([
    readJson(path.join(sourcePluginRoot, ".codex-plugin", "plugin.json")),
    readJson(sourceMarketplacePath),
    readJson(path.join(sourcePluginRoot, "resources", "package-index.json")),
  ]);
  if (!/^0\.1\.0\+codex\.w7c[0-9]+-[0-9]{14}-[0-9a-f]{7,40}$/.test(sourceManifest.version)) {
    throw new Error(`manifest is not a frozen Wave 7 candidate: ${sourceManifest.version}`);
  }
  if (sourceMarketplace.name !== "nacl-local") {
    throw new Error(`candidate marketplace must be nacl-local, found ${sourceMarketplace.name}`);
  }
  const legacyNames = [...(sourcePackageIndex.internalWorkflows ?? [])]
    .filter((name) => name !== "nacl-postmortem")
    .sort();
  if (sourcePackageIndex.internalWorkflows?.length !== 60 || legacyNames.length !== 59) {
    throw new Error("candidate legacy journey requires the exact 59-of-60 live catalog fixture");
  }
  const marketplaceEntry = sourceMarketplace.plugins?.find((entry) => entry?.name === "nacl");
  if (
    marketplaceEntry?.source?.source !== "local" ||
    marketplaceEntry?.source?.path !== "./plugins/nacl" ||
    marketplaceEntry?.policy?.installation !== "AVAILABLE" ||
    marketplaceEntry?.policy?.authentication !== "ON_INSTALL"
  ) {
    throw new Error("candidate marketplace entry is not UI-installable");
  }

  const workRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-wave7-candidate-"));
  const marketplaceRoot = path.join(workRoot, "marketplace");
  const marketplacePlugin = path.join(marketplaceRoot, "plugins", "nacl");
  const marketplaceManifest = path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json");
  const oldMarketplaceRoot = path.join(workRoot, "old-personal-marketplace");
  const oldMarketplacePlugin = path.join(oldMarketplaceRoot, "plugins", "nacl");
  const oldMarketplaceManifest = path.join(oldMarketplaceRoot, ".agents", "plugins", "marketplace.json");
  const home = path.join(workRoot, "home");
  const codexHome = path.join(workRoot, "codex-home");
  const projectRoot = path.join(workRoot, "project");
  const historicalLegacyRoot = path.join(workRoot, "historical-legacy-targets");
  const durableStateRoot = path.join(home, ".nacl", "codex", "local-graph");
  const selector = `nacl@${sourceMarketplace.name}`;
  const baselineVersion = "0.1.0+codex.rollback-baseline-a10194b";
  const report = {
    schemaVersion: 1,
    status: "UNVERIFIED",
    candidateVersion: sourceManifest.version,
    marketplace: { name: sourceMarketplace.name, selector },
    artifact: await directoryDigest(sourcePluginRoot),
    cleanHome: true,
    update: null,
    sourceUnavailable: false,
    publicSkills: [],
    mcpTools: [],
    installationConflict: null,
    legacyTransition: null,
    agentProfiles: null,
    persistence: null,
    rollback: null,
    desktop: {
      status: "NOT_RUN",
      reason: "Desktop discovery and approval require a user-driven restart and a new task",
    },
  };

  try {
    await Promise.all([
      mkdir(path.dirname(marketplaceManifest), { recursive: true }),
      mkdir(path.dirname(marketplacePlugin), { recursive: true }),
      mkdir(path.dirname(oldMarketplaceManifest), { recursive: true }),
      mkdir(path.dirname(oldMarketplacePlugin), { recursive: true }),
      mkdir(home, { recursive: true }),
      mkdir(codexHome, { recursive: true }),
      mkdir(projectRoot, { recursive: true }),
    ]);
    await cp(sourceMarketplacePath, marketplaceManifest);
    const env = safeEnv(home, codexHome);
    report.codexVersion = run("codex", ["--version"], { cwd: repoRoot, env }).stdout.trim();

    const oldMarketplace = structuredClone(sourceMarketplace);
    oldMarketplace.name = "personal";
    oldMarketplace.interface = { displayName: "Old NaCl Personal" };
    await writeJson(oldMarketplaceManifest, oldMarketplace);
    await stagePlugin(oldMarketplacePlugin, baselineVersion);
    run("codex", ["plugin", "marketplace", "add", oldMarketplaceRoot, "--json"], {
      cwd: repoRoot,
      env,
    });
    await install(env, "nacl@personal", baselineVersion, codexHome);
    const legacySkillsRoot = path.join(home, ".agents", "skills");
    const legacyTargetBytes = new Map();
    await Promise.all([
      mkdir(legacySkillsRoot, { recursive: true }),
      mkdir(historicalLegacyRoot, { recursive: true }),
    ]);
    for (const name of legacyNames) {
      let target = path.join(repoRoot, "skills-for-codex", name);
      if (auditedLegacyHashes.has(name)) {
        target = path.join(historicalLegacyRoot, name);
        await mkdir(target, { recursive: true });
        const historical = run("git", [
          "show",
          `${auditedLegacyBase}:skills-for-codex/${name}/SKILL.md`,
        ], { cwd: repoRoot, env }).stdout;
        if (sha256Bytes(historical) !== auditedLegacyHashes.get(name)) {
          throw new Error(`audited legacy fixture hash mismatch for ${name}`);
        }
        await writeFile(path.join(target, "SKILL.md"), historical);
      }
      legacyTargetBytes.set(name, await readFile(path.join(target, "SKILL.md")));
      await symlink(target, path.join(legacySkillsRoot, name));
    }
    run("codex", ["plugin", "remove", "nacl@personal", "--json"], { cwd: repoRoot, env });
    for (const name of legacyNames) {
      if (!(await lstat(path.join(legacySkillsRoot, name))).isSymbolicLink()) {
        throw new Error(`removing the old plugin unexpectedly removed legacy user skill ${name}`);
      }
    }
    report.legacyTransition = {
      oldPluginRemoved: true,
      legacySymlinkRemained: true,
      legacySymlinkCount: legacyNames.length,
      missingCatalogEntry: "nacl-postmortem",
      auditedBaseGenerationCount: auditedLegacyHashes.size,
    };

    run("codex", ["plugin", "marketplace", "add", marketplaceRoot, "--json"], {
      cwd: repoRoot,
      env,
    });

    await stagePlugin(marketplacePlugin, baselineVersion);
    const baselinePath = await install(env, selector, baselineVersion, codexHome);
    await stagePlugin(marketplacePlugin, sourceManifest.version);
    const candidatePath = await install(env, selector, sourceManifest.version, codexHome);
    if (baselinePath === candidatePath) throw new Error("cachebuster update reused the old cache path");
    report.update = {
      from: baselineVersion,
      to: sourceManifest.version,
      distinctCachePaths: true,
    };

    const [sourceInventory, cacheInventory, sourceDigest, cacheDigest] = await Promise.all([
      skillInventory(sourcePluginRoot),
      skillInventory(candidatePath),
      directoryDigest(sourcePluginRoot),
      directoryDigest(candidatePath),
    ]);
    assertJsonEqual(sourceInventory, expectedSkills, "source skill inventory");
    assertJsonEqual(cacheInventory, expectedSkills, "cache skill inventory");
    if (sourceDigest.sha256 !== cacheDigest.sha256 || sourceDigest.fileCount !== cacheDigest.fileCount) {
      throw new Error("installed cache bytes differ from the candidate artifact");
    }
    report.publicSkills = cacheInventory;

    const unavailablePath = `${marketplacePlugin}.unavailable`;
    await rename(marketplacePlugin, unavailablePath);
    report.sourceUnavailable = true;
    const migrationGraphSentinel = path.join(durableStateRoot, "migration-preserve.json");
    const migrationProfileSentinel = path.join(projectRoot, ".codex", "agents", "user-preexisting.toml");
    await Promise.all([
      mkdir(path.dirname(migrationGraphSentinel), { recursive: true }),
      mkdir(path.dirname(migrationProfileSentinel), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(migrationGraphSentinel, '{"graphUserData":"preserve"}\n'),
      writeFile(migrationProfileSentinel, 'name = "user-preexisting"\n'),
    ]);
    const transport = findTransport(env);
    const initial = invoke(transport, env, [
      { name: "nacl_installation_doctor" },
      {
        name: "nacl_graph_local_init",
        arguments: {
          project_id: "wave7-candidate-project",
          project_root: projectRoot,
          confirmation: "NOT_CONFIRMED",
        },
      },
      { name: "nacl_legacy_symlinks_plan" },
    ]);
    if (initial.serverInfo.version !== sourceManifest.version) {
      throw new Error("cached MCP server version differs from the candidate manifest");
    }
    const toolNames = initial.tools.map((tool) => tool.name);
    assertJsonEqual(toolNames, expectedTools, "cached MCP tool inventory");
    report.mcpTools = toolNames;
    const [doctor, blockedInit, migrationPlan] = initial.calls;
    if (
      doctor.status !== "FAILED" ||
      doctor.mode !== "both" ||
      doctor.executionLocation !== "installed-cache" ||
      doctor.pluginVersion !== sourceManifest.version
    ) {
      throw new Error(`cached doctor returned ${doctor.status}/${doctor.mode}/${doctor.pluginVersion}`);
    }
    if (blockedInit.status !== "FAILED" || blockedInit.code !== "INSTALLATION_CONFLICT") {
      throw new Error(`normal tool escaped installation conflict: ${blockedInit.status}/${blockedInit.code}`);
    }
    if (migrationPlan.status !== "VERIFIED" || migrationPlan.code !== "LEGACY_SYMLINK_PLAN_READY") {
      throw new Error(`legacy migration plan failed: ${migrationPlan.status}/${migrationPlan.code}`);
    }
    if (
      migrationPlan.foundCount !== 59 ||
      migrationPlan.acceptedCount !== 59 ||
      migrationPlan.missingCount !== 1 ||
      migrationPlan.entries.length !== 59 ||
      migrationPlan.blockers.length !== 0
    ) {
      throw new Error(`legacy live-shape plan mismatch: ${JSON.stringify({
        foundCount: migrationPlan.foundCount,
        acceptedCount: migrationPlan.acceptedCount,
        missingCount: migrationPlan.missingCount,
        blockers: migrationPlan.blockers,
      })}`);
    }
    const historicalPlanEntries = migrationPlan.entries
      .filter((entry) => entry.acceptedGeneration === "audited-base-d98f7399")
      .map((entry) => [entry.name, entry.targetHash, entry.acceptedSourceCommit]);
    assertJsonEqual(
      historicalPlanEntries,
      [...auditedLegacyHashes.entries()].sort().map(([name, targetHash]) => [name, targetHash, auditedLegacyBase]),
      "audited legacy plan provenance",
    );

    const conflict = invoke(transport, env, [{ name: "nacl_installation_doctor" }]).calls[0];
    if (conflict.status !== "FAILED" || conflict.mode !== "both") {
      throw new Error(`double installation was not diagnosed: ${conflict.status}/${conflict.mode}`);
    }
    const migrationApply = invoke(transport, env, [{
      name: "nacl_legacy_symlinks_apply",
      arguments: {
        plan_token: migrationPlan.planToken,
        confirmation: migrationPlan.confirmation,
      },
    }]).calls[0];
    if (migrationApply.status !== "VERIFIED" || migrationApply.code !== "LEGACY_SYMLINKS_REMOVED") {
      throw new Error(`legacy migration apply failed: ${migrationApply.status}/${migrationApply.code}`);
    }
    if (migrationApply.removed.length !== 59) {
      throw new Error(`legacy migration removed ${migrationApply.removed.length}, expected 59`);
    }
    for (const name of legacyNames) {
      const target = auditedLegacyHashes.has(name)
        ? path.join(historicalLegacyRoot, name)
        : path.join(repoRoot, "skills-for-codex", name);
      if (!(await readFile(path.join(target, "SKILL.md"))).equals(legacyTargetBytes.get(name))) {
        throw new Error(`legacy migration changed source skill target ${name}`);
      }
      try {
        await lstat(path.join(legacySkillsRoot, name));
        throw new Error(`legacy migration retained symlink ${name}`);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    if (
      await readFile(migrationGraphSentinel, "utf8") !== '{"graphUserData":"preserve"}\n' ||
      await readFile(migrationProfileSentinel, "utf8") !== 'name = "user-preexisting"\n'
    ) {
      throw new Error("legacy migration changed graph or project-profile sentinels");
    }
    const recovered = invoke(transport, env, [{ name: "nacl_installation_doctor" }]).calls[0];
    if (recovered.status !== "VERIFIED" || recovered.mode !== "plugin-only") {
      throw new Error("plugin-only recovery did not pass after removing the disposable legacy fixture");
    }
    report.installationConflict = {
      detected: true,
      recovered: true,
      recovery: "confirmed-legacy-symlink-migration",
      migratedSymlinkCount: migrationApply.removed.length,
      foundCount: migrationPlan.foundCount,
      missingCount: migrationPlan.missingCount,
      blockers: migrationPlan.blockers.length,
      auditedBaseGenerationCount: historicalPlanEntries.length,
      sourceTargetsPreserved: true,
      graphStatePreserved: true,
      projectProfilesPreserved: true,
    };

    const postRecovery = invoke(transport, env, [
      {
        name: "nacl_graph_local_init",
        arguments: {
          project_id: "wave7-candidate-project",
          project_root: projectRoot,
          confirmation: "NOT_CONFIRMED",
        },
      },
      { name: "nacl_agent_profiles_plan", arguments: { project_root: projectRoot } },
    ]).calls;
    const [confirmationBlockedInit, profilePlan] = postRecovery;
    if (
      confirmationBlockedInit.status !== "BLOCKED" ||
      confirmationBlockedInit.code !== "CONFIRMATION_REQUIRED"
    ) {
      throw new Error(`unsafe init was not confirmation-blocked after recovery: ${confirmationBlockedInit.status}/${confirmationBlockedInit.code}`);
    }
    if (profilePlan.status !== "VERIFIED" || profilePlan.code !== "AGENT_PROFILE_PLAN_READY") {
      throw new Error(`profile plan failed after recovery: ${profilePlan.status}/${profilePlan.code}`);
    }

    const profileApply = invoke(transport, env, [
      {
        name: "nacl_agent_profiles_apply",
        arguments: {
          project_root: projectRoot,
          plan_token: profilePlan.planToken,
          confirmation: profilePlan.confirmation,
        },
      },
    ]).calls[0];
    if (profileApply.status !== "VERIFIED" || profileApply.code !== "AGENT_PROFILES_INSTALLED") {
      throw new Error(`profile apply failed: ${profileApply.status}/${profileApply.code}`);
    }
    const userOwnedProfile = profileApply.entries[0].destination;
    const userBytes = "name = \"user-owned-wave7-profile\"\n";
    await writeFile(userOwnedProfile, userBytes);
    const profileConflict = invoke(transport, env, [
      { name: "nacl_agent_profiles_plan", arguments: { project_root: projectRoot } },
    ]).calls[0];
    if (profileConflict.status !== "BLOCKED" || profileConflict.code !== "AGENT_PROFILE_CONFLICT") {
      throw new Error(`profile conflict was not blocked: ${profileConflict.status}/${profileConflict.code}`);
    }
    if (await readFile(userOwnedProfile, "utf8") !== userBytes) {
      throw new Error("profile conflict overwrote user-owned bytes");
    }
    report.agentProfiles = {
      explicitConfirmation: true,
      created: profileApply.changed.length,
      conflictBlocked: true,
      userBytesPreserved: true,
    };

    await mkdir(durableStateRoot, { recursive: true });
    const sentinelPath = path.join(durableStateRoot, "wave7-uninstall-persistence.json");
    const sentinelBytes = '{"externalProjectState":"preserve"}\n';
    await writeFile(sentinelPath, sentinelBytes);
    await rename(unavailablePath, marketplacePlugin);
    run("codex", ["plugin", "remove", selector, "--json"], { cwd: repoRoot, env });
    if (await readFile(sentinelPath, "utf8") !== sentinelBytes) {
      throw new Error("plugin removal changed external graph state");
    }
    if (await readFile(userOwnedProfile, "utf8") !== userBytes) {
      throw new Error("plugin removal changed project agent profiles");
    }
    report.persistence = { graphStatePreserved: true, projectProfilesPreserved: true };

    await stagePlugin(marketplacePlugin, baselineVersion);
    await install(env, selector, baselineVersion, codexHome);
    await stagePlugin(marketplacePlugin, sourceManifest.version);
    await install(env, selector, sourceManifest.version, codexHome);
    report.rollback = {
      rollbackVersion: baselineVersion,
      rollbackInstalled: true,
      candidateReinstalled: true,
    };
    run("codex", ["plugin", "remove", selector, "--json"], { cwd: repoRoot, env });
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
