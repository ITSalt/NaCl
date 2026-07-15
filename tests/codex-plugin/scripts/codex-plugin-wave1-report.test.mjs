import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_HELPER_HASHES,
  evaluateMatrixReport,
} from "../../../scripts/codex-plugin-wave1-report.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const matrixScript = path.join(
  repoRoot,
  "scripts",
  "codex-plugin-wave1-matrix.mjs",
);
const cacheFiles = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "scripts/nacl-spike-mcp.mjs",
  "skills/nacl-spike-health/SKILL.md",
];
const syntheticRoot = path.join(path.parse(repoRoot).root, "synthetic-runtime");
const syntheticHome = path.join(syntheticRoot, "developer-home");
const syntheticDarwinTempRoot = path.join(
  path.parse(repoRoot).root,
  "var",
  "folders",
  "synthetic",
  "T",
  "nacl-codex-plugin-wave1-matrix-private-alias",
);
const syntheticDarwinTempCanonical = path.join(
  path.parse(repoRoot).root,
  "private",
  "var",
  "folders",
  "synthetic",
  "T",
  "nacl-codex-plugin-wave1-matrix-private-alias",
);

function command(payload, exitCode = 0) {
  return {
    command: ["fixture"],
    exitCode,
    signal: null,
    stdout: typeof payload === "string" ? payload : `${JSON.stringify(payload)}\n`,
    stderr: "",
    error: null,
  };
}

function skippedInvocation() {
  return {
    command: null,
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "MCP server is not visible as a STDIO transport",
    response: null,
  };
}

function healthInvocation(installedPath, version, report) {
  const payload = {
    contract: "nacl-codex-plugin-wave-1",
    status: "ok",
    echo: "cli-configured-transport",
    pluginVersion: version,
    executionLocation: "installed-cache",
    scriptPath: path.join(installedPath, "scripts", "nacl-spike-mcp.mjs"),
    cwd: installedPath,
    nodeExecutable: path.join(path.parse(installedPath).root, "bin", "node"),
    nodeVersion: report.nodeVersion,
    minimumNodeMajor: 20,
    platform: report.platform,
    architecture: report.architecture,
  };
  return {
    ...command(""),
    response: {
      jsonrpc: "2.0",
      id: 2,
      result: { structuredContent: payload },
    },
  };
}

function mcpList(installedPath, visible) {
  return command(
    visible
      ? [
          {
            name: "nacl-spike",
            transport: {
              type: "stdio",
              command: "node",
              args: ["./scripts/nacl-spike-mcp.mjs"],
              cwd: `${installedPath}${path.sep}.`,
            },
          },
        ]
      : [],
  );
}

function shapeFixture(shapeName, report) {
  const visible = shapeName !== "snake-case-wrapper";
  const shapeRoot = path.join(report.workRoot, shapeName);
  const shapeRootCanonical = path.join(report.workRootCanonical, shapeName);
  const home = path.join(shapeRoot, "home");
  const homeCanonical = path.join(shapeRootCanonical, "home");
  const codexHome = path.join(shapeRoot, "codex-home");
  const codexHomeCanonical = path.join(shapeRootCanonical, "codex-home");
  const marketplaceRoot = path.join(shapeRoot, "marketplace");
  const installedPath = path.join(
    codexHome,
    "plugins",
    "cache",
    "personal",
    "nacl",
    report.sourceVersion,
  );
  const installedPathCanonical = path.join(
    codexHomeCanonical,
    "plugins",
    "cache",
    "personal",
    "nacl",
    report.sourceVersion,
  );
  const validator =
    shapeName === "camel-case-companion"
      ? command("Plugin validation passed\n")
      : shapeName === "direct-map"
        ? command(
            "Plugin validation failed:\n- `.mcp.json` field `nacl-spike` is not accepted by plugin validation\n- `.mcp.json` field `mcpServers` must be an object\n",
            1,
          )
        : command(
            "Plugin validation failed:\n- `.mcp.json` field `mcp_servers` is not accepted by plugin validation\n- `.mcp.json` field `mcpServers` must be an object\n",
            1,
          );
  const shape = {
    shape: shapeName,
    shapeRoot,
    shapeRootCanonical,
    home,
    homeCanonical,
    codexHome,
    codexHomeCanonical,
    environment: { HOME: home, CODEX_HOME: codexHome },
    marketplaceRoot,
    validator,
    marketplaceName: command("personal\n"),
    marketplaceAdd: command({
      marketplaceName: "personal",
      installedRoot: marketplaceRoot,
      alreadyAdded: false,
    }),
    marketplaceList: command({
      marketplaces: [{ name: "personal", root: marketplaceRoot }],
    }),
    availableBeforeInstall: command({
      installed: [],
      available: [
        {
          pluginId: "nacl@personal",
          version: report.sourceVersion,
          installed: false,
          enabled: false,
          source: { path: path.join(marketplaceRoot, "plugins", "nacl") },
          installPolicy: "AVAILABLE",
          authPolicy: "ON_INSTALL",
        },
      ],
    }),
    pluginAdd: command({
      pluginId: "nacl@personal",
      name: "nacl",
      marketplaceName: "personal",
      version: report.sourceVersion,
      installedPath,
      authPolicy: "ON_INSTALL",
    }),
    installedPath,
    installedPathCanonical,
    pluginList: command({
      installed: [
        {
          pluginId: "nacl@personal",
          version: report.sourceVersion,
          installed: true,
          enabled: true,
        },
      ],
      available: [],
    }),
    mcpList: mcpList(installedPath, visible),
    transportInvocation: visible
      ? healthInvocation(installedPath, report.sourceVersion, report)
      : skippedInvocation(),
    cache: {
      path: installedPath,
      canonicalPath: installedPathCanonical,
      files: [...cacheFiles],
      violations: [],
    },
    sourceUnavailable: true,
    sourceProbe: { sourceExists: false, unavailableExists: true },
    mcpListWithoutSource: mcpList(installedPath, visible),
    transportInvocationWithoutSource: visible
      ? healthInvocation(installedPath, report.sourceVersion, report)
      : skippedInvocation(),
    pluginRemove: command({
      pluginId: "nacl@personal",
      name: "nacl",
      marketplaceName: "personal",
    }),
    pluginListAfterRemove: command({ installed: [], available: [] }),
  };

  if (shapeName === "camel-case-companion") {
    const updatedVersion = "0.1.0+codex.synthetic-new";
    const reinstalledPath = path.join(
      codexHome,
      "plugins",
      "cache",
      "personal",
      "nacl",
      updatedVersion,
    );
    const reinstalledPathCanonical = path.join(
      codexHomeCanonical,
      "plugins",
      "cache",
      "personal",
      "nacl",
      updatedVersion,
    );
    Object.assign(shape, {
      cachebuster: command(
        `Updated plugin version: ${report.sourceVersion} -> ${updatedVersion}\n`,
      ),
      updatedVersion,
      updatedManifestError: null,
      reinstall: command({
        pluginId: "nacl@personal",
        name: "nacl",
        marketplaceName: "personal",
        version: updatedVersion,
        installedPath: reinstalledPath,
        authPolicy: "ON_INSTALL",
      }),
      reinstalledPath,
      reinstalledPathCanonical,
      reinstalledCache: {
        path: reinstalledPath,
        canonicalPath: reinstalledPathCanonical,
        files: [...cacheFiles],
        violations: [],
      },
      reinstallMcpList: mcpList(reinstalledPath, true),
      reinstallTransportInvocation: healthInvocation(
        reinstalledPath,
        updatedVersion,
        report,
      ),
      reinstallSourceProbe: { sourceExists: false, unavailableExists: true },
      reinstallMcpListWithoutSource: mcpList(reinstalledPath, true),
      reinstallTransportInvocationWithoutSource: healthInvocation(
        reinstalledPath,
        updatedVersion,
        report,
      ),
    });
  }
  return shape;
}

function validReport({
  workRoot = path.join(
    path.parse(process.cwd()).root,
    "nacl-codex-plugin-wave1-matrix-synthetic",
  ),
  workRootCanonical = workRoot,
  platform = "darwin",
} = {}) {
  const report = {
    schemaVersion: 3,
    repoHeadCommand: command(`${"a".repeat(40)}\n`),
    repoHead: "a".repeat(40),
    codexVersion: command("codex-cli 0.142.0\n"),
    sourceVersion: "0.1.0+codex.synthetic-old",
    nodeVersion: "v24.13.1",
    platform,
    architecture: "arm64",
    workRoot,
    workRootCanonical,
    helperHashes: { ...EXPECTED_HELPER_HASHES },
    shapes: [],
  };
  report.shapes = [
    shapeFixture("camel-case-companion", report),
    shapeFixture("direct-map", report),
    shapeFixture("snake-case-wrapper", report),
  ];
  return report;
}

test("accepts a complete synthetic report with explicit expected shape differences", () => {
  const result = evaluateMatrixReport(validReport());
  assert.equal(result.overallStatus, "VERIFIED");
  assert.deepEqual(result.failures, []);
  assert.deepEqual(
    result.shapeResults.map((shape) => [shape.shape, shape.status]),
    [
      ["camel-case-companion", "VERIFIED"],
      ["direct-map", "VERIFIED"],
      ["snake-case-wrapper", "VERIFIED"],
    ],
  );
});

test("accepts the bounded macOS /private realpath alias for disposable roots", () => {
  const report = validReport({
    workRoot: syntheticDarwinTempRoot,
    workRootCanonical: syntheticDarwinTempCanonical,
  });
  const result = evaluateMatrixReport(report);
  assert.equal(result.overallStatus, "VERIFIED", result.failures.join("\n"));
});

test("fails synthetic reports for child, shape, cache, health, and helper drift", async (t) => {
  const cases = [
    [
      "child exit",
      (report) => {
        report.shapes[0].pluginAdd.exitCode = 9;
      },
      "shape.camel-case-companion.pluginAdd.exit",
    ],
    [
      "invalid shape unexpectedly validates",
      (report) => {
        report.shapes[1].validator.exitCode = 0;
      },
      "shape.direct-map.validator.exit",
    ],
    [
      "snake shape unexpectedly visible",
      (report) => {
        report.shapes[2].mcpList = mcpList(report.shapes[2].installedPath, true);
      },
      "shape.snake-case-wrapper.mcpList.visibility",
    ],
    [
      "cache violation",
      (report) => {
        report.shapes[0].cache.violations.push("developer path");
      },
      "shape.camel-case-companion.cache.violations",
    ],
    [
      "source-unavailable health drift",
      (report) => {
        report.shapes[0].transportInvocationWithoutSource.response.result.structuredContent.executionLocation =
          "source-or-disposable-copy";
      },
      "shape.camel-case-companion.transportInvocationWithoutSource.health.location",
    ],
    [
      "helper hash drift",
      (report) => {
        report.helperHashes.cachebuster = "0".repeat(64);
      },
      "matrix.helperHash.cachebuster",
    ],
    [
      "missing source version",
      (report) => {
        report.sourceVersion = null;
      },
      "matrix.sourceVersion",
    ],
  ];

  for (const [name, mutate, expectedFailure] of cases) {
    await t.test(name, () => {
      const report = validReport();
      mutate(report);
      const result = evaluateMatrixReport(report);
      assert.equal(result.overallStatus, "FAILED");
      assert.equal(
        result.failures.some((failure) => failure.includes(expectedFailure)),
        true,
        result.failures.join("\n"),
      );
    });
  }
});

test("fails disposable HOME, CODEX_HOME, and canonical cache escapes", async (t) => {
  const cases = [
    [
      "live CODEX_HOME",
      (report) => {
        const shape = report.shapes[0];
        const escaped = path.join(syntheticHome, ".codex");
        shape.codexHome = escaped;
        shape.codexHomeCanonical = escaped;
        shape.environment.CODEX_HOME = escaped;
      },
      "shape.camel-case-companion.isolation.codexHome",
    ],
    [
      "HOME escape",
      (report) => {
        const shape = report.shapes[0];
        shape.home = syntheticHome;
        shape.homeCanonical = syntheticHome;
        shape.environment.HOME = syntheticHome;
      },
      "shape.camel-case-companion.isolation.home",
    ],
    [
      "cache outside exact CODEX_HOME with the expected suffix",
      (report) => {
        const shape = report.shapes[0];
        const escaped = path.join(
          syntheticHome,
          ".codex",
          "plugins",
          "cache",
          "personal",
          "nacl",
          report.sourceVersion,
        );
        shape.installedPath = escaped;
        shape.installedPathCanonical = escaped;
        shape.cache.path = escaped;
        shape.cache.canonicalPath = escaped;
      },
      "shape.camel-case-companion.cache.canonicalPath",
    ],
    [
      "CODEX_HOME canonical symlink escape",
      (report) => {
        report.shapes[0].codexHomeCanonical = path.join(
          syntheticRoot,
          "outside-codex-home",
        );
      },
      "shape.camel-case-companion.isolation.codexHomeCanonicalPair",
    ],
    [
      "cache canonical symlink escape",
      (report) => {
        const shape = report.shapes[0];
        const escaped = path.join(
          syntheticRoot,
          "outside-codex-home",
          "plugins",
          "cache",
          "personal",
          "nacl",
          report.sourceVersion,
        );
        shape.installedPathCanonical = escaped;
        shape.cache.canonicalPath = escaped;
      },
      "shape.camel-case-companion.cache.canonicalPair",
    ],
  ];

  for (const [name, mutate, expectedFailure] of cases) {
    await t.test(name, () => {
      const report = validReport();
      mutate(report);
      const result = evaluateMatrixReport(report);
      assert.equal(result.overallStatus, "FAILED");
      assert.equal(
        result.failures.some((failure) => failure.includes(expectedFailure)),
        true,
        result.failures.join("\n"),
      );
    });
  }
});

test("prepare-only is explicitly NOT_RUN and cannot hide preparation failures", () => {
  const report = validReport();
  const prepared = evaluateMatrixReport(report, { prepareOnly: true });
  assert.equal(prepared.overallStatus, "NOT_RUN");
  assert.equal(prepared.mode, "prepare-only");
  assert.equal(
    prepared.shapeResults.every((shape) => shape.status === "NOT_RUN"),
    true,
  );

  report.helperHashes.validator = "0".repeat(64);
  const failed = evaluateMatrixReport(report, { prepareOnly: true });
  assert.equal(failed.overallStatus, "FAILED");
});

test(
  "matrix process exits nonzero and writes FAILED report when the Codex command fails",
  { skip: process.platform === "win32" },
  async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-matrix-negative-"));
    try {
      const falseCodex = path.join(tempRoot, "false-codex.sh");
      const validator = path.join(tempRoot, "validator.py");
      const cachebuster = path.join(tempRoot, "cachebuster.py");
      const nameReader = path.join(tempRoot, "name-reader.py");
      const output = path.join(tempRoot, "report.json");
      await writeFile(falseCodex, "#!/bin/sh\nexit 7\n");
      await chmod(falseCodex, 0o755);
      await writeFile(validator, "raise SystemExit(1)\n");
      await writeFile(cachebuster, "print('synthetic cachebuster')\n");
      await writeFile(nameReader, "print('personal')\n");

      const processResult = spawnSync(
        process.execPath,
        [
          matrixScript,
          "--codex",
          falseCodex,
          "--validator",
          validator,
          "--cachebuster",
          cachebuster,
          "--marketplace-name-reader",
          nameReader,
          "--output",
          output,
        ],
        { cwd: repoRoot, encoding: "utf8", timeout: 30_000 },
      );

      assert.notEqual(processResult.status, 0, processResult.stdout);
      assert.match(processResult.stderr, /Matrix FAILED/);
      const report = JSON.parse(await readFile(output, "utf8"));
      assert.equal(report.overallStatus, "FAILED");
      assert.equal(
        report.failures.some((failure) =>
          failure.includes("matrix.codexVersion.exit"),
        ),
        true,
        report.failures.join("\n"),
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  },
);
