import path from "node:path";

export const EXPECTED_HELPER_HASHES = Object.freeze({
  validator: "ebda00d55d7518b127f675f062fb5c6e7a1ffdc0a99df1a55ac594400d7d3228",
  cachebuster: "4fe3c5a49212f6e30a2306e245c460e01aaf5e36bc8ad3dd2852c199257eff89",
  marketplaceNameReader:
    "7659216759152f83087020b4d2971b4ad3cc13851e2614efc30fc2317ad59d96",
});

const EXPECTED_SHAPES = [
  "camel-case-companion",
  "direct-map",
  "snake-case-wrapper",
];
const EXPECTED_CACHE_FILES = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "scripts/nacl-spike-mcp.mjs",
  "skills/nacl-spike-health/SKILL.md",
];

function printable(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createCollector(scope) {
  const checks = [];
  const failures = [];
  function check(id, passed, expected, actual) {
    const entry = {
      id,
      passed: Boolean(passed),
      expected,
      actual,
    };
    checks.push(entry);
    if (!entry.passed) {
      failures.push(
        `${scope}.${id}: expected ${printable(expected)}, got ${printable(actual)}`,
      );
    }
    return entry.passed;
  }
  return { check, checks, failures };
}

function commandExit(collector, id, result, expectedExit) {
  return collector.check(
    `${id}.exit`,
    result?.exitCode === expectedExit,
    expectedExit,
    result?.exitCode ?? null,
  );
}

function commandJson(collector, id, result, expectedExit = 0) {
  if (!commandExit(collector, id, result, expectedExit)) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    // The check below records the parse failure without throwing.
  }
  collector.check(`${id}.json`, parsed !== null, "valid JSON", result?.stdout ?? null);
  return parsed;
}

function pathEndsWith(absolutePath, suffixParts) {
  if (
    typeof absolutePath !== "string" ||
    !path.isAbsolute(absolutePath) ||
    suffixParts.some((part) => typeof part !== "string")
  ) {
    return false;
  }
  return absolutePath.endsWith(path.join(...suffixParts));
}

function sameResolvedPath(left, right) {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    path.resolve(left) === path.resolve(right)
  );
}

function safeCanonicalPair(rawPath, canonicalPath, platform) {
  if (
    typeof rawPath !== "string" ||
    typeof canonicalPath !== "string" ||
    !path.isAbsolute(rawPath) ||
    !path.isAbsolute(canonicalPath)
  ) {
    return false;
  }
  const raw = path.resolve(rawPath);
  const canonical = path.resolve(canonicalPath);
  if (raw === canonical) return true;
  if (platform !== "darwin") return false;
  const isDarwinAlias = ["/tmp", "/var"].some(
    (root) => raw === root || raw.startsWith(`${root}${path.sep}`),
  );
  return isDarwinAlias && canonical === `/private${raw}`;
}

function samePathOrSafeAlias(left, right, platform) {
  return (
    sameResolvedPath(left, right) ||
    safeCanonicalPair(left, right, platform) ||
    safeCanonicalPair(right, left, platform)
  );
}

function isStrictDescendant(candidate, root) {
  if (
    typeof candidate !== "string" ||
    typeof root !== "string" ||
    !path.isAbsolute(candidate) ||
    !path.isAbsolute(root)
  ) {
    return false;
  }
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative.length > 0 &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function validateIsolation(collector, shape, report) {
  const expectedShapeRoot = path.join(report.workRoot ?? "", shape.shape ?? "");
  const expectedShapeRootCanonical = path.join(
    report.workRootCanonical ?? "",
    shape.shape ?? "",
  );
  const expectedHome = path.join(expectedShapeRoot, "home");
  const expectedHomeCanonical = path.join(expectedShapeRootCanonical, "home");
  const expectedCodexHome = path.join(expectedShapeRoot, "codex-home");
  const expectedCodexHomeCanonical = path.join(
    expectedShapeRootCanonical,
    "codex-home",
  );

  collector.check(
    "isolation.shapeRoot",
    sameResolvedPath(shape.shapeRoot, expectedShapeRoot),
    expectedShapeRoot,
    shape.shapeRoot ?? null,
  );
  collector.check(
    "isolation.shapeRootCanonicalPair",
    safeCanonicalPair(shape.shapeRoot, shape.shapeRootCanonical, report.platform),
    "recorded realpath equal to the raw path or its safe macOS /private alias",
    { raw: shape.shapeRoot ?? null, canonical: shape.shapeRootCanonical ?? null },
  );
  collector.check(
    "isolation.shapeRootCanonical",
    sameResolvedPath(shape.shapeRootCanonical, expectedShapeRootCanonical),
    expectedShapeRootCanonical,
    shape.shapeRootCanonical ?? null,
  );
  collector.check(
    "isolation.home",
    sameResolvedPath(shape.home, expectedHome),
    expectedHome,
    shape.home ?? null,
  );
  collector.check(
    "isolation.homeCanonicalPair",
    safeCanonicalPair(shape.home, shape.homeCanonical, report.platform),
    "recorded realpath equal to the raw path or its safe macOS /private alias",
    { raw: shape.home ?? null, canonical: shape.homeCanonical ?? null },
  );
  collector.check(
    "isolation.homeCanonical",
    sameResolvedPath(shape.homeCanonical, expectedHomeCanonical) &&
      isStrictDescendant(shape.homeCanonical, report.workRootCanonical),
    expectedHomeCanonical,
    shape.homeCanonical ?? null,
  );
  collector.check(
    "isolation.codexHome",
    sameResolvedPath(shape.codexHome, expectedCodexHome),
    expectedCodexHome,
    shape.codexHome ?? null,
  );
  collector.check(
    "isolation.codexHomeCanonicalPair",
    safeCanonicalPair(shape.codexHome, shape.codexHomeCanonical, report.platform),
    "recorded realpath equal to the raw path or its safe macOS /private alias",
    { raw: shape.codexHome ?? null, canonical: shape.codexHomeCanonical ?? null },
  );
  collector.check(
    "isolation.codexHomeCanonical",
    sameResolvedPath(shape.codexHomeCanonical, expectedCodexHomeCanonical) &&
      isStrictDescendant(shape.codexHomeCanonical, report.workRootCanonical),
    expectedCodexHomeCanonical,
    shape.codexHomeCanonical ?? null,
  );
  collector.check(
    "isolation.distinctHomes",
    !sameResolvedPath(shape.home, shape.codexHome),
    "distinct disposable HOME and CODEX_HOME",
    { home: shape.home ?? null, codexHome: shape.codexHome ?? null },
  );
  collector.check(
    "isolation.environmentKeys",
    JSON.stringify(Object.keys(shape.environment ?? {}).sort()) ===
      JSON.stringify(["CODEX_HOME", "HOME"]),
    ["CODEX_HOME", "HOME"],
    Object.keys(shape.environment ?? {}).sort(),
  );
  collector.check(
    "isolation.environmentHome",
    shape.environment?.HOME === shape.home,
    shape.home ?? null,
    shape.environment?.HOME ?? null,
  );
  collector.check(
    "isolation.environmentCodexHome",
    shape.environment?.CODEX_HOME === shape.codexHome,
    shape.codexHome ?? null,
    shape.environment?.CODEX_HOME ?? null,
  );
  collector.check(
    "isolation.marketplaceRoot",
    sameResolvedPath(
      shape.marketplaceRoot,
      path.join(expectedShapeRoot, "marketplace"),
    ),
    path.join(expectedShapeRoot, "marketplace"),
    shape.marketplaceRoot ?? null,
  );
}

function validateCache(
  collector,
  id,
  cache,
  installedPath,
  installedPathCanonical,
  codexHomeCanonical,
  version,
  platform,
) {
  const expectedCanonicalPath = path.join(
    codexHomeCanonical ?? "",
    "plugins",
    "cache",
    "personal",
    "nacl",
    version ?? "",
  );
  collector.check(
    `${id}.path`,
    pathEndsWith(installedPath, ["plugins", "cache", "personal", "nacl", version]),
    `absolute */plugins/cache/personal/nacl/${version}`,
    installedPath ?? null,
  );
  collector.check(
    `${id}.canonicalPair`,
    safeCanonicalPair(installedPath, installedPathCanonical, platform),
    "recorded realpath equal to the cache path or its safe macOS /private alias",
    { raw: installedPath ?? null, canonical: installedPathCanonical ?? null },
  );
  collector.check(
    `${id}.canonicalPath`,
    sameResolvedPath(installedPathCanonical, expectedCanonicalPath),
    expectedCanonicalPath,
    installedPathCanonical ?? null,
  );
  collector.check(
    `${id}.insideCodexHome`,
    isStrictDescendant(installedPathCanonical, codexHomeCanonical),
    `strict descendant of canonical CODEX_HOME ${codexHomeCanonical}`,
    installedPathCanonical ?? null,
  );
  collector.check(
    `${id}.scanPath`,
    cache?.path === installedPath,
    installedPath ?? null,
    cache?.path ?? null,
  );
  collector.check(
    `${id}.scanCanonicalPair`,
    safeCanonicalPair(cache?.path, cache?.canonicalPath, platform),
    "scanned cache path and its recorded realpath",
    { raw: cache?.path ?? null, canonical: cache?.canonicalPath ?? null },
  );
  collector.check(
    `${id}.scanCanonicalPath`,
    sameResolvedPath(cache?.canonicalPath, installedPathCanonical),
    installedPathCanonical ?? null,
    cache?.canonicalPath ?? null,
  );
  collector.check(
    `${id}.files`,
    JSON.stringify(cache?.files ?? null) === JSON.stringify(EXPECTED_CACHE_FILES),
    EXPECTED_CACHE_FILES,
    cache?.files ?? null,
  );
  collector.check(
    `${id}.violations`,
    Array.isArray(cache?.violations) && cache.violations.length === 0,
    [],
    cache?.violations ?? null,
  );
}

function validateMcpList(
  collector,
  id,
  result,
  { visible, installedPath },
) {
  const entries = commandJson(collector, id, result);
  if (!Array.isArray(entries)) {
    collector.check(`${id}.array`, false, "JSON array", entries);
    return null;
  }
  collector.check(`${id}.array`, true, "JSON array", "JSON array");
  const spikeEntries = entries.filter((entry) => entry?.name === "nacl-spike");
  collector.check(
    `${id}.visibility`,
    visible ? spikeEntries.length === 1 : spikeEntries.length === 0,
    visible ? "exactly one nacl-spike entry" : "no nacl-spike entry",
    spikeEntries.length,
  );
  if (!visible || spikeEntries.length !== 1) return null;

  const transport = spikeEntries[0].transport;
  collector.check(`${id}.transport.type`, transport?.type === "stdio", "stdio", transport?.type);
  collector.check(`${id}.transport.command`, transport?.command === "node", "node", transport?.command);
  collector.check(
    `${id}.transport.args`,
    JSON.stringify(transport?.args) === JSON.stringify(["./scripts/nacl-spike-mcp.mjs"]),
    ["./scripts/nacl-spike-mcp.mjs"],
    transport?.args ?? null,
  );
  collector.check(
    `${id}.transport.cwd`,
    sameResolvedPath(transport?.cwd, installedPath),
    installedPath,
    transport?.cwd ?? null,
  );
  return transport;
}

function healthPayload(invocation) {
  return invocation?.response?.result?.structuredContent ?? null;
}

function validateInvocation(
  collector,
  id,
  invocation,
  { visible, installedPath, version, report },
) {
  if (!visible) {
    collector.check(`${id}.exit`, invocation?.exitCode === null, null, invocation?.exitCode);
    collector.check(`${id}.response`, invocation?.response === null, null, invocation?.response);
    collector.check(
      `${id}.reason`,
      invocation?.stderr === "MCP server is not visible as a STDIO transport",
      "MCP server is not visible as a STDIO transport",
      invocation?.stderr ?? null,
    );
    return;
  }

  commandExit(collector, id, invocation, 0);
  collector.check(`${id}.jsonrpc`, invocation?.response?.jsonrpc === "2.0", "2.0", invocation?.response?.jsonrpc);
  collector.check(`${id}.responseId`, invocation?.response?.id === 2, 2, invocation?.response?.id);
  collector.check(`${id}.error`, invocation?.response?.error == null, null, invocation?.response?.error ?? null);
  const health = healthPayload(invocation);
  collector.check(`${id}.health.present`, health !== null, "structured health payload", health);
  if (health === null) return;
  collector.check(`${id}.health.contract`, health.contract === "nacl-codex-plugin-wave-1", "nacl-codex-plugin-wave-1", health.contract);
  collector.check(`${id}.health.status`, health.status === "ok", "ok", health.status);
  collector.check(`${id}.health.echo`, health.echo === "cli-configured-transport", "cli-configured-transport", health.echo);
  collector.check(`${id}.health.version`, health.pluginVersion === version, version, health.pluginVersion);
  collector.check(`${id}.health.location`, health.executionLocation === "installed-cache", "installed-cache", health.executionLocation);
  collector.check(
    `${id}.health.scriptPath`,
    sameResolvedPath(
      health.scriptPath,
      path.join(installedPath ?? "", "scripts", "nacl-spike-mcp.mjs"),
    ),
    path.join(installedPath ?? "", "scripts", "nacl-spike-mcp.mjs"),
    health.scriptPath,
  );
  collector.check(`${id}.health.cwd`, sameResolvedPath(health.cwd, installedPath), installedPath, health.cwd);
  collector.check(`${id}.health.nodeExecutable`, path.isAbsolute(health.nodeExecutable ?? ""), "absolute path", health.nodeExecutable);
  collector.check(`${id}.health.nodeVersion`, health.nodeVersion === report.nodeVersion, report.nodeVersion, health.nodeVersion);
  collector.check(`${id}.health.minimumNodeMajor`, health.minimumNodeMajor === 20, 20, health.minimumNodeMajor);
  collector.check(`${id}.health.platform`, health.platform === report.platform, report.platform, health.platform);
  collector.check(`${id}.health.architecture`, health.architecture === report.architecture, report.architecture, health.architecture);
}

function validateSourceProbe(collector, id, probe) {
  collector.check(`${id}.sourceExists`, probe?.sourceExists === false, false, probe?.sourceExists);
  collector.check(`${id}.unavailableExists`, probe?.unavailableExists === true, true, probe?.unavailableExists);
}

function validateCommonRuntime(collector, shape, report, visible) {
  const marketplaceAdd = commandJson(collector, "marketplaceAdd", shape.marketplaceAdd);
  collector.check("marketplaceAdd.name", marketplaceAdd?.marketplaceName === "personal", "personal", marketplaceAdd?.marketplaceName);
  collector.check("marketplaceAdd.alreadyAdded", marketplaceAdd?.alreadyAdded === false, false, marketplaceAdd?.alreadyAdded);
  collector.check(
    "marketplaceAdd.root",
    samePathOrSafeAlias(
      marketplaceAdd?.installedRoot,
      shape.marketplaceRoot,
      report.platform,
    ),
    shape.marketplaceRoot,
    marketplaceAdd?.installedRoot ?? null,
  );

  const marketplaces = commandJson(collector, "marketplaceList", shape.marketplaceList);
  collector.check(
    "marketplaceList.personal",
    Array.isArray(marketplaces?.marketplaces) &&
      marketplaces.marketplaces.length === 1 &&
      marketplaces.marketplaces[0]?.name === "personal",
    "one personal marketplace",
    marketplaces?.marketplaces ?? null,
  );
  collector.check(
    "marketplaceList.root",
    samePathOrSafeAlias(
      marketplaces?.marketplaces?.[0]?.root,
      shape.marketplaceRoot,
      report.platform,
    ),
    shape.marketplaceRoot,
    marketplaces?.marketplaces?.[0]?.root ?? null,
  );

  const available = commandJson(collector, "availableBeforeInstall", shape.availableBeforeInstall);
  const availableEntry = available?.available?.[0];
  collector.check(
    "availableBeforeInstall.entry",
    Array.isArray(available?.installed) &&
      available.installed.length === 0 &&
      Array.isArray(available?.available) &&
      available.available.length === 1 &&
      availableEntry?.pluginId === "nacl@personal" &&
      availableEntry?.version === report.sourceVersion &&
      availableEntry?.installed === false &&
      availableEntry?.enabled === false &&
      availableEntry?.installPolicy === "AVAILABLE" &&
      availableEntry?.authPolicy === "ON_INSTALL" &&
      samePathOrSafeAlias(
        availableEntry?.source?.path,
        path.join(shape.marketplaceRoot ?? "", "plugins", "nacl"),
        report.platform,
      ),
    `one available nacl@personal at ${report.sourceVersion}`,
    available,
  );

  const add = commandJson(collector, "pluginAdd", shape.pluginAdd);
  collector.check("pluginAdd.id", add?.pluginId === "nacl@personal", "nacl@personal", add?.pluginId);
  collector.check("pluginAdd.name", add?.name === "nacl", "nacl", add?.name);
  collector.check("pluginAdd.marketplace", add?.marketplaceName === "personal", "personal", add?.marketplaceName);
  collector.check("pluginAdd.authPolicy", add?.authPolicy === "ON_INSTALL", "ON_INSTALL", add?.authPolicy);
  collector.check("pluginAdd.version", add?.version === report.sourceVersion, report.sourceVersion, add?.version);
  collector.check("pluginAdd.pathMatchesReport", add?.installedPath === shape.installedPath, shape.installedPath, add?.installedPath);
  collector.check(
    "pluginAdd.pathOutsideMarketplace",
    typeof shape.installedPathCanonical === "string" &&
      !isStrictDescendant(
        shape.installedPathCanonical,
        path.join(shape.shapeRootCanonical ?? "", "marketplace"),
      ),
    "canonical installed cache outside marketplace source",
    shape.installedPathCanonical,
  );

  const installed = commandJson(collector, "pluginList", shape.pluginList);
  collector.check(
    "pluginList.entry",
    Array.isArray(installed?.installed) &&
      installed.installed.length === 1 &&
      installed.installed[0]?.pluginId === "nacl@personal" &&
      installed.installed[0]?.version === report.sourceVersion &&
      installed.installed[0]?.installed === true &&
      installed.installed[0]?.enabled === true &&
      Array.isArray(installed?.available) &&
      installed.available.length === 0,
    `one installed nacl@personal at ${report.sourceVersion}`,
    installed,
  );

  validateCache(
    collector,
    "cache",
    shape.cache,
    shape.installedPath,
    shape.installedPathCanonical,
    shape.codexHomeCanonical,
    report.sourceVersion,
    report.platform,
  );
  validateMcpList(collector, "mcpList", shape.mcpList, {
    visible,
    installedPath: shape.installedPath,
  });
  validateInvocation(collector, "transportInvocation", shape.transportInvocation, {
    visible,
    installedPath: shape.installedPath,
    version: report.sourceVersion,
    report,
  });
  collector.check("sourceUnavailable", shape.sourceUnavailable === true, true, shape.sourceUnavailable);
  validateSourceProbe(collector, "sourceProbe", shape.sourceProbe);
  validateMcpList(collector, "mcpListWithoutSource", shape.mcpListWithoutSource, {
    visible,
    installedPath: shape.installedPath,
  });
  validateInvocation(
    collector,
    "transportInvocationWithoutSource",
    shape.transportInvocationWithoutSource,
    {
      visible,
      installedPath: shape.installedPath,
      version: report.sourceVersion,
      report,
    },
  );
}

function validateCamelReinstall(collector, shape, report) {
  commandExit(collector, "cachebuster", shape.cachebuster, 0);
  collector.check(
    "cachebuster.manifestError",
    shape.updatedManifestError === null,
    null,
    shape.updatedManifestError ?? null,
  );
  const baseVersion =
    typeof report.sourceVersion === "string"
      ? report.sourceVersion.split("+")[0]
      : "<invalid-version>";
  const versionPattern = new RegExp(
    `^${baseVersion.replaceAll(".", "\\.")}\\+codex\\.[0-9A-Za-z.-]+$`,
  );
  collector.check(
    "cachebuster.updatedVersion",
    typeof shape.updatedVersion === "string" &&
      shape.updatedVersion !== report.sourceVersion &&
      versionPattern.test(shape.updatedVersion),
    `${baseVersion}+codex.<new-token>, different from ${report.sourceVersion}`,
    shape.updatedVersion,
  );
  collector.check(
    "cachebuster.stdout",
    shape.cachebuster?.stdout?.includes(report.sourceVersion) &&
      shape.cachebuster.stdout.includes(shape.updatedVersion),
    "helper output naming old and new versions",
    shape.cachebuster?.stdout ?? null,
  );

  const reinstall = commandJson(collector, "reinstall", shape.reinstall);
  collector.check("reinstall.id", reinstall?.pluginId === "nacl@personal", "nacl@personal", reinstall?.pluginId);
  collector.check("reinstall.name", reinstall?.name === "nacl", "nacl", reinstall?.name);
  collector.check("reinstall.marketplace", reinstall?.marketplaceName === "personal", "personal", reinstall?.marketplaceName);
  collector.check("reinstall.authPolicy", reinstall?.authPolicy === "ON_INSTALL", "ON_INSTALL", reinstall?.authPolicy);
  collector.check("reinstall.version", reinstall?.version === shape.updatedVersion, shape.updatedVersion, reinstall?.version);
  collector.check("reinstall.pathMatchesReport", reinstall?.installedPath === shape.reinstalledPath, shape.reinstalledPath, reinstall?.installedPath);
  collector.check("reinstall.pathChanged", shape.reinstalledPath !== shape.installedPath, "different cache path", shape.reinstalledPath);
  validateCache(
    collector,
    "reinstalledCache",
    shape.reinstalledCache,
    shape.reinstalledPath,
    shape.reinstalledPathCanonical,
    shape.codexHomeCanonical,
    shape.updatedVersion,
    report.platform,
  );
  validateMcpList(collector, "reinstallMcpList", shape.reinstallMcpList, {
    visible: true,
    installedPath: shape.reinstalledPath,
  });
  validateInvocation(
    collector,
    "reinstallTransportInvocation",
    shape.reinstallTransportInvocation,
    {
      visible: true,
      installedPath: shape.reinstalledPath,
      version: shape.updatedVersion,
      report,
    },
  );
  validateSourceProbe(collector, "reinstallSourceProbe", shape.reinstallSourceProbe);
  validateMcpList(
    collector,
    "reinstallMcpListWithoutSource",
    shape.reinstallMcpListWithoutSource,
    { visible: true, installedPath: shape.reinstalledPath },
  );
  validateInvocation(
    collector,
    "reinstallTransportInvocationWithoutSource",
    shape.reinstallTransportInvocationWithoutSource,
    {
      visible: true,
      installedPath: shape.reinstalledPath,
      version: shape.updatedVersion,
      report,
    },
  );
}

function validateRemoval(collector, shape) {
  const removed = commandJson(collector, "pluginRemove", shape.pluginRemove);
  collector.check("pluginRemove.id", removed?.pluginId === "nacl@personal", "nacl@personal", removed?.pluginId);
  collector.check("pluginRemove.name", removed?.name === "nacl", "nacl", removed?.name);
  collector.check("pluginRemove.marketplace", removed?.marketplaceName === "personal", "personal", removed?.marketplaceName);
  const after = commandJson(collector, "pluginListAfterRemove", shape.pluginListAfterRemove);
  collector.check(
    "pluginListAfterRemove.empty",
    Array.isArray(after?.installed) &&
      after.installed.length === 0 &&
      Array.isArray(after?.available) &&
      after.available.length === 0,
    { installed: [], available: [] },
    after,
  );
}

function validateShape(shape, report, prepareOnly) {
  const collector = createCollector(`shape.${shape?.shape ?? "<missing>"}`);
  validateIsolation(collector, shape, report);
  const expectedValidatorExit = shape?.shape === "camel-case-companion" ? 0 : 1;
  commandExit(collector, "validator", shape?.validator, expectedValidatorExit);
  if (shape?.shape === "direct-map") {
    collector.check(
      "validator.reason",
      shape.validator?.stdout?.includes("field `nacl-spike` is not accepted") &&
        shape.validator.stdout.includes("field `mcpServers` must be an object"),
      "direct-map rejection details",
      shape.validator?.stdout ?? null,
    );
  } else if (shape?.shape === "snake-case-wrapper") {
    collector.check(
      "validator.reason",
      shape.validator?.stdout?.includes("field `mcp_servers` is not accepted") &&
        shape.validator.stdout.includes("field `mcpServers` must be an object"),
      "snake-case rejection details",
      shape.validator?.stdout ?? null,
    );
  }
  commandExit(collector, "marketplaceName", shape?.marketplaceName, 0);
  collector.check(
    "marketplaceName.value",
    shape?.marketplaceName?.stdout?.trim() === "personal",
    "personal",
    shape?.marketplaceName?.stdout?.trim() ?? null,
  );

  if (!prepareOnly) {
    const visible = shape.shape !== "snake-case-wrapper";
    validateCommonRuntime(collector, shape, report, visible);
    if (shape.shape === "camel-case-companion") {
      validateCamelReinstall(collector, shape, report);
    } else {
      collector.check(
        "noUnexpectedReinstall",
        shape.reinstall === undefined && shape.cachebuster === undefined,
        "no reinstall fields for non-camel shape",
        { reinstall: shape.reinstall, cachebuster: shape.cachebuster },
      );
    }
    validateRemoval(collector, shape);
  }

  return {
    shape: shape?.shape ?? null,
    status:
      collector.failures.length > 0
        ? "FAILED"
        : prepareOnly
          ? "NOT_RUN"
          : "VERIFIED",
    checks: collector.checks,
    failures: collector.failures,
  };
}

export function evaluateMatrixReport(report, { prepareOnly = false } = {}) {
  const collector = createCollector("matrix");
  collector.check("schemaVersion", report?.schemaVersion === 3, 3, report?.schemaVersion);
  commandExit(collector, "repoHeadCommand", report?.repoHeadCommand, 0);
  collector.check(
    "repoHead",
    typeof report?.repoHead === "string" &&
      /^[0-9a-f]{40}$/.test(report.repoHead) &&
      report.repoHead === report.repoHeadCommand?.stdout?.trim(),
    "40-hex SHA matching repoHeadCommand stdout",
    report?.repoHead ?? null,
  );
  commandExit(collector, "codexVersion", report?.codexVersion, 0);
  collector.check(
    "codexVersion.value",
    report?.codexVersion?.stdout?.trim() === "codex-cli 0.142.0",
    "codex-cli 0.142.0",
    report?.codexVersion?.stdout?.trim() ?? null,
  );
  collector.check(
    "sourceVersion",
    typeof report?.sourceVersion === "string" &&
      /^0\.1\.0(?:\+codex\.[0-9A-Za-z.-]+)?$/.test(report.sourceVersion),
    "0.1.0 with optional Codex cachebuster",
    report?.sourceVersion ?? null,
  );
  collector.check(
    "workRoot.absoluteDisposable",
    typeof report?.workRoot === "string" &&
      path.isAbsolute(report.workRoot) &&
      path.basename(report.workRoot).startsWith(
        "nacl-codex-plugin-wave1-matrix-",
      ),
    "absolute nacl-codex-plugin-wave1-matrix-* path",
    report?.workRoot ?? null,
  );
  collector.check(
    "workRoot.canonicalPair",
    safeCanonicalPair(report?.workRoot, report?.workRootCanonical, report?.platform),
    "recorded realpath equal to the work root or its safe macOS /private alias",
    {
      raw: report?.workRoot ?? null,
      canonical: report?.workRootCanonical ?? null,
    },
  );
  for (const [name, expected] of Object.entries(EXPECTED_HELPER_HASHES)) {
    collector.check(
      `helperHash.${name}`,
      report?.helperHashes?.[name] === expected,
      expected,
      report?.helperHashes?.[name] ?? null,
    );
  }
  collector.check(
    "shapes",
    JSON.stringify(report?.shapes?.map((shape) => shape.shape)) ===
      JSON.stringify(EXPECTED_SHAPES),
    EXPECTED_SHAPES,
    report?.shapes?.map((shape) => shape.shape) ?? null,
  );

  const shapeResults = Array.isArray(report?.shapes)
    ? report.shapes.map((shape) => validateShape(shape, report, prepareOnly))
    : [];
  const failures = [
    ...collector.failures,
    ...shapeResults.flatMap((shape) => shape.failures),
  ];
  return {
    mode: prepareOnly ? "prepare-only" : "runtime",
    overallStatus:
      failures.length > 0 ? "FAILED" : prepareOnly ? "NOT_RUN" : "VERIFIED",
    checks: collector.checks,
    failures,
    shapeResults,
  };
}
