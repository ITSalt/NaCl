#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectCodexConfig, renderManagedBlock } from "./codex-config-contract.mjs";
import { releaseIdentity } from "./neo4j-mcp-supply.mjs";

const require = createRequire(import.meta.url);
const { parse: parseToml } = require("./vendor/smol-toml-1.7.0.cjs");

const CONTRACT = "nacl-skills-only-bootstrap-plan-v1";
const BOOTSTRAP_POLICY_VERSION = "nacl-skills-only-bootstrap-policy-v2";
const NEO4J_IMAGE = "neo4j:5.24.2-community@sha256:2e7e4eea5bc1eec581a3097c018dfeb3747f3638e67a963c10554825c31c1425";
const APOC_SHA256 = "39092c89df1cb80f4f3d8799821e74c7f1d10503f92625be32882b70b13002fa";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const resourceRoot = path.resolve(scriptDir, "..");
const skillRoot = path.resolve(scriptDir, "../..");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function emit(value, stream = process.stdout) {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}

function stop(code) {
  emit({ contract: CONTRACT, status: "BLOCKED", code }, process.stderr);
  process.exit(1);
}

function parseArguments(argv) {
  const selected = { database: "neo4j", diagnoseOnly: false, verificationPlan: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--diagnose-only") selected.diagnoseOnly = true;
    else if (argument === "--verification-plan") selected.verificationPlan = true;
    else if (argument.startsWith("--") && index + 1 < argv.length) selected[argument.slice(2)] = argv[++index];
    else stop("ARGUMENT_INVALID");
  }
  if (selected.diagnoseOnly && selected.verificationPlan) stop("ARGUMENT_CONFLICT");
  return selected;
}

function canonicalRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) stop("PROJECT_ROOT_NOT_ABSOLUTE");
  let root;
  try { root = realpathSync(value); } catch { stop("PROJECT_ROOT_UNAVAILABLE"); }
  const metadata = lstatSync(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) stop("PROJECT_ROOT_UNSAFE");
  return root;
}

function inside(root, filename) {
  const resolved = path.resolve(filename);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function fileState(root, relative) {
  const filename = path.resolve(root, relative);
  if (!inside(root, filename)) stop("STATE_PATH_UNSAFE");
  let ancestor = root;
  for (const segment of path.relative(root, filename).split(path.sep).slice(0, -1)) {
    ancestor = path.join(ancestor, segment);
    let ancestorMetadata;
    try { ancestorMetadata = lstatSync(ancestor); } catch (error) {
      if (error?.code === "ENOENT") break;
      stop("STATE_READ_FAILED");
    }
    if (ancestorMetadata.isSymbolicLink()) return { path: relative.split(path.sep).join("/"), state: "UNSAFE", type: "ANCESTOR_SYMLINK" };
    if (!ancestorMetadata.isDirectory()) return { path: relative.split(path.sep).join("/"), state: "UNSAFE", type: "ANCESTOR_NOT_DIRECTORY" };
  }
  let metadata;
  try { metadata = lstatSync(filename); } catch (error) {
    if (error?.code === "ENOENT") return { path: relative.split(path.sep).join("/"), state: "ABSENT" };
    stop("STATE_READ_FAILED");
  }
  const record = { path: relative.split(path.sep).join("/") };
  if (metadata.isSymbolicLink()) return { ...record, state: "UNSAFE", type: "SYMLINK" };
  if (metadata.isDirectory()) return { ...record, state: "DIRECTORY" };
  if (!metadata.isFile()) return { ...record, state: "UNSAFE", type: "OTHER" };
  return {
    ...record,
    state: "FILE",
    size: metadata.size,
    sha256: sha256(readFileSync(filename)),
    mode: process.platform === "win32" ? "WINDOWS_ACL_REQUIRED" : (metadata.mode & 0o777).toString(8).padStart(4, "0"),
  };
}

function sourceRecord(filename, destination, action = "COPY_IF_ABSENT_OR_EXACT") {
  let metadata;
  try { metadata = lstatSync(filename); } catch { stop("BUNDLE_RESOURCE_MISSING"); }
  if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(filename) !== path.resolve(filename)) stop("BUNDLE_RESOURCE_UNSAFE");
  return {
    destination,
    action,
    sourceSha256: sha256(readFileSync(filename)),
  };
}

function requiredSourceFiles(directory, names) {
  let directoryMetadata;
  try { directoryMetadata = lstatSync(directory); } catch { stop("BUNDLE_RESOURCE_MISSING"); }
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink() || realpathSync(directory) !== path.resolve(directory)) stop("BUNDLE_RESOURCE_UNSAFE");
  const available = new Set(readdirSync(directory));
  const files = [];
  for (const name of names) {
    if (!available.has(name)) stop("BUNDLE_RESOURCE_MISSING");
    const filename = path.join(directory, name);
    const metadata = lstatSync(filename);
    if (!metadata.isFile() || metadata.isSymbolicLink()) stop("BUNDLE_RESOURCE_UNSAFE");
    files.push(filename);
  }
  return files;
}

function validateSelection(selected) {
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(selected["project-id"] ?? "")) stop("PROJECT_ID_INVALID");
  if (!/^[A-Za-z0-9._-]{1,63}$/.test(selected.database ?? "")) stop("DATABASE_INVALID");
  for (const key of ["bolt-port", "http-port"]) {
    if (!/^[0-9]+$/.test(selected[key] ?? "") || Number(selected[key]) < 1024 || Number(selected[key]) > 65535) stop("PORT_INVALID");
  }
  if (selected["bolt-port"] === selected["http-port"]) stop("PORT_COLLISION");
}

function bootstrapAssets() {
  const names = [
    "apply-project-schema.mjs",
    "codex-config-contract.mjs",
    "codex-config-guard.mjs",
    "graph-docker-compose.yml",
    "install-pinned-neo4j-mcp.mjs",
    "neo4j-mcp-release.pin",
    "neo4j-mcp-supply.mjs",
    "plan-project-graph.mjs",
    "preflight-project-graph.mjs",
    "project-neo4j-launcher.mjs",
    "protected-env.ps1",
    "rollback-project-bootstrap.mjs",
    "setup-project-graph.ps1",
    "setup-project-graph.sh",
    "write-codex-mcp-config.mjs",
  ];
  return [
    ...names.map((name) => sourceRecord(path.join(scriptDir, name), `bundle/resources/bootstrap/${name}`, "BUNDLE_POLICY_INPUT")),
    sourceRecord(path.join(scriptDir, "vendor", "smol-toml-1.7.0.cjs"), "bundle/resources/bootstrap/vendor/smol-toml-1.7.0.cjs", "BUNDLE_POLICY_INPUT"),
    sourceRecord(path.join(scriptDir, "vendor", "smol-toml-LICENSE.txt"), "bundle/resources/bootstrap/vendor/smol-toml-LICENSE.txt", "BUNDLE_POLICY_INPUT"),
    sourceRecord(path.join(scriptDir, "vendor", "PROVENANCE.md"), "bundle/resources/bootstrap/vendor/PROVENANCE.md", "BUNDLE_POLICY_INPUT"),
  ].sort((left, right) => Buffer.from(left.destination).compare(Buffer.from(right.destination)));
}

async function buildPlan(root, selected) {
  validateSelection(selected);
  const projectId = selected["project-id"];
  const boltPort = Number(selected["bolt-port"]);
  const httpPort = Number(selected["http-port"]);
  const database = selected.database;
  const launcher = path.join(root, "graph-infra", "scripts", "nacl-neo4j-mcp-launcher.mjs");
  const binary = path.join(root, "graph-infra", "bin", process.platform === "win32" ? "neo4j-mcp.exe" : "neo4j-mcp");
  const nodeExecutable = realpathSync(process.execPath);
  const uri = `bolt://localhost:${boltPort}`;
  const expectedConfigBlock = renderManagedBlock({ node: nodeExecutable, launcher, binary, uri, database });
  const currentState = {
    codexConfig: fileState(root, path.join(".codex", "config.toml")),
    graphEnvironment: fileState(root, path.join("graph-infra", ".env")),
    projectLauncher: fileState(root, path.join("graph-infra", "scripts", "nacl-neo4j-mcp-launcher.mjs")),
    binaryReceipt: fileState(root, path.join("graph-infra", "bin", "neo4j-mcp.receipt.json")),
    binary: fileState(root, path.join("graph-infra", "bin", process.platform === "win32" ? "neo4j-mcp.exe" : "neo4j-mcp")),
    gitignore: fileState(root, ".gitignore"),
    graphDirectory: fileState(root, "graph-infra"),
    graphSchemaDirectory: fileState(root, path.join("graph-infra", "schema")),
    graphQueryDirectory: fileState(root, path.join("graph-infra", "queries")),
    graphBoardDirectory: fileState(root, path.join("graph-infra", "boards")),
    graphScriptDirectory: fileState(root, path.join("graph-infra", "scripts")),
    graphBinaryDirectory: fileState(root, path.join("graph-infra", "bin")),
    codexDirectory: fileState(root, ".codex"),
  };
  if (currentState.codexConfig.state === "FILE") {
    currentState.codexConfig.semantic = inspectCodexConfig(readFileSync(path.join(root, ".codex", "config.toml"), "utf8"), expectedConfigBlock);
  }
  const pinPath = path.join(scriptDir, "neo4j-mcp-release.pin");
  const supply = releaseIdentity(pinPath);
  const schemas = requiredSourceFiles(path.join(resourceRoot, "graph-infra", "schema"), ["ba-schema.cypher", "sa-schema.cypher", "tl-schema.cypher"]);
  const queries = requiredSourceFiles(path.join(resourceRoot, "graph-infra", "queries"), ["ba-queries.cypher", "handoff-queries.cypher", "sa-queries.cypher", "tl-queries.cypher", "validation-queries.cypher"]);
  const migrations = requiredSourceFiles(path.join(skillRoot, "graph", "migrations"), ["001-gateway-foundation.json", "002-concurrency-foundation.json", "003-schema-resource-identity.json"]);
  const intendedFiles = [
    { destination: ".gitignore", action: "APPEND_EXACT_GITIGNORE_ENTRIES" },
    { destination: ".codex/config.toml", action: "ATOMIC_APPEND_OR_EXACT_REUSE", expectedBlockSha256: sha256(expectedConfigBlock) },
    sourceRecord(path.join(scriptDir, "graph-docker-compose.yml"), "graph-infra/docker-compose.yml"),
    sourceRecord(path.join(scriptDir, "project-neo4j-launcher.mjs"), "graph-infra/scripts/nacl-neo4j-mcp-launcher.mjs"),
    sourceRecord(path.join(scriptDir, "neo4j-mcp-supply.mjs"), "graph-infra/scripts/neo4j-mcp-supply.mjs"),
    sourceRecord(pinPath, "graph-infra/scripts/neo4j-mcp-release.pin"),
    { destination: "graph-infra/.env", action: "CREATE_PROTECTED_OR_EXACT_REUSE", secret: "GENERATED_NOT_IN_PLAN" },
    { destination: "graph-infra/.env.example", action: "CREATE_SECRET_FREE_OR_EXACT_REUSE" },
    { destination: `graph-infra/bin/${path.basename(binary)}`, action: "INSTALL_PINNED_BINARY_OR_VERIFY_EXACT" },
    { destination: "graph-infra/bin/neo4j-mcp.receipt.json", action: "CREATE_STRICT_RECEIPT_OR_VERIFY_EXACT" },
    ...schemas.map((filename) => sourceRecord(filename, `graph-infra/schema/${path.basename(filename)}`)),
    ...queries.map((filename) => sourceRecord(filename, `graph-infra/queries/${path.basename(filename)}`)),
  ].sort((left, right) => Buffer.from(left.destination).compare(Buffer.from(right.destination)));
  const intendedFileStates = intendedFiles.map((entry) => fileState(root, entry.destination));
  const blockingConditions = [];
  for (const key of ["codexConfig", "graphEnvironment", "projectLauncher", "binaryReceipt", "binary", "gitignore"]) {
    const record = currentState[key];
    if (!new Set(["ABSENT", "FILE"]).has(record.state)) blockingConditions.push(`EXPECTED_FILE:${record.path}`);
  }
  for (const key of ["graphDirectory", "graphSchemaDirectory", "graphQueryDirectory", "graphBoardDirectory", "graphScriptDirectory", "graphBinaryDirectory", "codexDirectory"]) {
    const record = currentState[key];
    if (!new Set(["ABSENT", "DIRECTORY"]).has(record.state)) blockingConditions.push(`EXPECTED_DIRECTORY:${record.path}`);
  }
  for (const record of intendedFileStates) if (!new Set(["ABSENT", "FILE"]).has(record.state)) blockingConditions.push(`EXPECTED_FILE:${record.path}`);
  if (currentState.codexConfig.semantic?.state === "blocked") blockingConditions.push(currentState.codexConfig.semantic.code);
  return {
    contract: CONTRACT,
    bootstrapPolicyVersion: BOOTSTRAP_POLICY_VERSION,
    snapshotKind: "CONTENT_ADDRESSED_CURRENT_STATE",
    canonicalProjectRoot: root,
    projectId,
    database,
    nodeExecutable,
    ports: {
      bolt: { host: "127.0.0.1", port: boltPort, availability: "VALIDATED_BY_APPLY_PREFLIGHT" },
      http: { host: "127.0.0.1", port: httpPort, availability: "VALIDATED_BY_APPLY_PREFLIGHT" },
    },
    neo4j: { image: NEO4J_IMAGE, apoc: { version: "5.24.2", sha256: APOC_SHA256, source: "PINNED_IMAGE" } },
    neo4jMcp: {
      source: supply.source,
      version: supply.version,
      platform: supply.platform,
      architecture: supply.architecture,
      asset: supply.asset,
      archiveSha256: supply.archiveSha256,
      binarySha256: supply.binarySha256,
    },
    intendedFiles,
    intendedFileStates,
    intendedDockerResources: {
      container: `${projectId}-neo4j`,
      dataVolume: `${projectId}-neo4j-data`,
      logVolume: `${projectId}-neo4j-logs`,
      network: `${projectId}-net`,
      composeProject: `${projectId}-graph`,
    },
    currentState,
    bundlePolicyAssets: bootstrapAssets(),
    migrationInputs: migrations.map((filename) => sourceRecord(filename, `bundle/graph/migrations/${path.basename(filename)}`, "CHECKSUM_LEDGERED_APPLY")),
    rollbackPolicy: {
      freshProjectFiles: "REMOVE_ONLY_FILES_CREATED_BY_THIS_RUN",
      existingConfigAndGitignore: "RESTORE_EXACT_PRE_RUN_BYTES",
      newDockerResources: "REMOVE_ONLY_RESOURCES_CREATED_BY_THIS_RUN",
      preexistingVolumes: "PRESERVE_AND_REPORT_BEST_EFFORT_IF_GRAPH_WRITE_OCCURRED",
      imageCache: "PRESERVE",
    },
    blockingConditions,
  };
}

function diagnose(root) {
  const binaryName = process.platform === "win32" ? "neo4j-mcp.exe" : "neo4j-mcp";
  const localGraphFiles = [
    path.join("graph-infra", "docker-compose.yml"),
    path.join("graph-infra", ".env"),
    path.join("graph-infra", ".env.example"),
    path.join("graph-infra", "scripts", "nacl-neo4j-mcp-launcher.mjs"),
    path.join("graph-infra", "scripts", "neo4j-mcp-supply.mjs"),
    path.join("graph-infra", "scripts", "neo4j-mcp-release.pin"),
    path.join("graph-infra", "bin", binaryName),
    path.join("graph-infra", "bin", "neo4j-mcp.receipt.json"),
    ...["ba-schema.cypher", "sa-schema.cypher", "tl-schema.cypher"].map((name) => path.join("graph-infra", "schema", name)),
    ...["ba-queries.cypher", "handoff-queries.cypher", "sa-queries.cypher", "tl-queries.cypher", "validation-queries.cypher"].map((name) => path.join("graph-infra", "queries", name)),
  ];
  const evidence = [
    fileState(root, path.join(".codex", "config.toml")),
    fileState(root, ".gitignore"),
    ...localGraphFiles.map((relative) => fileState(root, relative)),
  ];
  const unsafe = evidence.filter((entry) => entry.state === "UNSAFE" || entry.state === "DIRECTORY");
  const config = evidence[0];
  let managedMcp = false;
  if (config.state === "FILE") {
    try {
      const parsed = parseToml(readFileSync(path.join(root, ".codex", "config.toml"), "utf8"));
      managedMcp = Boolean(parsed?.mcp_servers?.nacl_neo4j && typeof parsed.mcp_servers.nacl_neo4j === "object");
    } catch {
      emit({ contract: CONTRACT, status: "BLOCKED", code: "CODEX_CONFIG_MALFORMED", initializationState: "BLOCKED", canonicalProjectRoot: root, evidence });
      return 1;
    }
  }
  if (unsafe.length > 0) {
    emit({ contract: CONTRACT, status: "BLOCKED", code: "LOCAL_BOOTSTRAP_STATE_UNSAFE", initializationState: "BLOCKED", canonicalProjectRoot: root, evidence });
    return 1;
  }
  const graphEvidence = evidence.slice(2);
  const present = graphEvidence.filter((entry) => entry.state === "FILE").length;
  if (!managedMcp && present === 0) {
    emit({ contract: CONTRACT, status: "NOT_RUN", code: "PROJECT_MCP_NOT_CONFIGURED", initializationState: "UNINITIALIZED", canonicalProjectRoot: root, evidence, mutation: "NONE", network: "NONE", docker: "NOT_INSPECTED" });
    return 0;
  }
  if (managedMcp && present === graphEvidence.length) {
    emit({ contract: CONTRACT, status: "PARTIALLY_VERIFIED", code: "PROJECT_MCP_VERIFICATION_REQUIRED", initializationState: "INITIALIZED_LOCAL_FILES", canonicalProjectRoot: root, evidence, mutation: "NONE", network: "NONE", docker: "NOT_INSPECTED", next: "NEW_TASK_PROJECT_MCP_VERIFICATION" });
    return 0;
  }
  emit({ contract: CONTRACT, status: "BLOCKED", code: "PARTIAL_BOOTSTRAP_STATE", initializationState: "BLOCKED", canonicalProjectRoot: root, evidence, mutation: "NONE", network: "NONE", docker: "NOT_INSPECTED" });
  return 1;
}

function verificationPlan(root, selected) {
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(selected["project-id"] ?? "")) stop("PROJECT_ID_INVALID");
  if (!/^[A-Za-z0-9._-]{1,63}$/.test(selected.database ?? "")) stop("DATABASE_INVALID");
  const idempotencyKey = `init-${randomBytes(24).toString("hex")}`;
  const plan = {
    contract: "nacl-skills-only-initialization-verification-v1",
    canonicalProjectRoot: root,
    projectId: selected["project-id"],
    database: selected.database,
    writeToolCapability: "project MCP write-cypher",
    writeStatement: "MERGE (canary:NaclGatewayCanary {project_id: $projectId}) ON CREATE SET canary.revision = 0 SET canary.revision = coalesce(canary.revision, 0) + 1, canary.idempotency_key = $idempotencyKey, canary.verified_at = datetime() RETURN canary.project_id AS projectId, canary.idempotency_key AS idempotencyKey, canary.revision AS revision",
    readbackStatement: "MATCH (canary:NaclGatewayCanary {project_id: $projectId}) RETURN canary.project_id AS projectId, canary.idempotency_key AS idempotencyKey, canary.revision AS revision",
    parameters: { projectId: selected["project-id"], idempotencyKey },
    readbackPolicy: "SEPARATE_PROJECT_MCP_READ_AFTER_WRITE",
  };
  const planHash = sha256(canonicalJson(plan));
  emit({
    contract: plan.contract,
    status: "NOT_RUN",
    code: "WRITE_CANARY_CONFIRMATION_REQUIRED",
    plan,
    planHash,
    confirmation: `VERIFY_NACL_INITIALIZATION:${selected["project-id"]}:${planHash}`,
  });
}

const selected = parseArguments(process.argv.slice(2));
const root = canonicalRoot(selected["project-root"]);
if (selected.diagnoseOnly) process.exitCode = diagnose(root);
else if (selected.verificationPlan) verificationPlan(root, selected);
else {
  const plan = await buildPlan(root, selected);
  const planHash = sha256(canonicalJson(plan));
  const expected = `INIT_LOCAL_GRAPH:${selected["project-id"]}:${planHash}`;
  if (selected["verify-token"] !== undefined) {
    if (selected["verify-token"] !== expected) {
      emit({ contract: CONTRACT, status: "BLOCKED", code: "PLAN_TOKEN_STALE", planHash }, process.stderr);
      process.exit(1);
    }
    if (plan.blockingConditions.length > 0) {
      emit({ contract: CONTRACT, status: "BLOCKED", code: "PLAN_STATE_BLOCKED", planHash, blockingConditions: plan.blockingConditions }, process.stderr);
      process.exit(1);
    }
    emit({ contract: CONTRACT, status: "VERIFIED", code: "PLAN_TOKEN_VERIFIED", planHash });
  } else if (plan.blockingConditions.length > 0) {
    emit({ contract: CONTRACT, status: "BLOCKED", code: "PLAN_STATE_BLOCKED", plan, planHash });
    process.exitCode = 1;
  } else {
    emit({ contract: CONTRACT, status: "NOT_RUN", code: "PLAN_READY", plan, planHash, confirmation: expected });
  }
}
