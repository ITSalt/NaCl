#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
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

const scriptPath = fileURLToPath(import.meta.url);
const canonicalScriptPath = await realpath(scriptPath);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const canonicalRepoRoot = await realpath(repoRoot);
const defaultManifest = path.join(repoRoot, "scripts", "codex-plugin-manifest.json");

function parseArgs(argv) {
  const options = { check: false, manifest: defaultManifest, output: null, productionMcpUrl: null, productionAppId: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--manifest") options.manifest = path.resolve(argv[++index] ?? "");
    else if (argument === "--output") options.output = path.resolve(argv[++index] ?? "");
    else if (argument === "--production-mcp-url") options.productionMcpUrl = argv[++index] ?? "";
    else if (argument === "--production-app-id") options.productionAppId = argv[++index] ?? "";
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.manifest) throw new Error("--manifest requires a path");
  if (options.check && options.output) throw new Error("--check and --output are mutually exclusive");
  if (Boolean(options.productionMcpUrl) !== Boolean(options.productionAppId)) {
    throw new Error("--production-mcp-url and --production-app-id must be provided together");
  }
  if (options.productionMcpUrl && (!options.output || options.check)) {
    throw new Error("Production binding requires a non-check external --output");
  }
  return options;
}

function productionBinding(options) {
  if (!options.productionMcpUrl) return null;
  let url;
  try { url = new URL(options.productionMcpUrl); } catch { throw new Error("--production-mcp-url is invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || url.pathname !== "/mcp") {
    throw new Error("--production-mcp-url must be an HTTPS /mcp resource URL without credentials, query, or fragment");
  }
  if (!/^plugin_asdk_app_[A-Za-z0-9_-]{16,128}$/.test(options.productionAppId)) {
    throw new Error("--production-app-id must be a portal-issued plugin_asdk_app identifier");
  }
  return Object.freeze({ mcpUrl: url.href, appId: options.productionAppId });
}

async function applyProductionBinding(destination, binding) {
  const mcp = {
    mcpServers: {
      nacl: {
        type: "http",
        url: binding.mcpUrl,
      },
    },
  };
  const app = { apps: { nacl: { id: binding.appId } } };
  const manifestPath = path.join(destination, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.apps = "./.app.json";
  await Promise.all([
    writeFile(path.join(destination, ".mcp.json"), `${JSON.stringify(mcp, null, 2)}\n`, { mode: 0o644 }),
    writeFile(path.join(destination, ".app.json"), `${JSON.stringify(app, null, 2)}\n`, { mode: 0o644 }),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 }),
  ]);
}

function inside(root, filename) {
  const resolved = path.resolve(filename);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function repoPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error(`Manifest path must be repository-relative: ${relativePath}`);
  }
  const resolved = path.resolve(repoRoot, relativePath);
  if (!inside(repoRoot, resolved)) throw new Error(`Manifest path escapes repository: ${relativePath}`);
  return resolved;
}

function relativeUnix(root, filename) {
  return path.relative(root, filename).split(path.sep).join("/");
}

async function assertRepoSource(filename, expectedType, label = "source") {
  const resolved = path.resolve(filename);
  if (!inside(repoRoot, resolved)) throw new Error(`${label} escapes repository: ${filename}`);
  const relative = path.relative(repoRoot, resolved);
  let current = repoRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Source symlink is forbidden: ${relativeUnix(repoRoot, current)}`);
    }
  }
  const canonical = await realpath(resolved);
  if (!inside(canonicalRepoRoot, canonical)) throw new Error(`${label} resolves outside repository: ${relativeUnix(repoRoot, resolved)}`);
  const metadata = await lstat(resolved);
  if (expectedType === "file" && !metadata.isFile()) throw new Error(`${label} is not a file: ${relativeUnix(repoRoot, resolved)}`);
  if (expectedType === "directory" && !metadata.isDirectory()) throw new Error(`${label} is not a directory: ${relativeUnix(repoRoot, resolved)}`);
  return resolved;
}

async function filesUnder(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      const metadata = await lstat(filename);
      if (metadata.isSymbolicLink()) throw new Error(`Source symlink is forbidden: ${relativeUnix(repoRoot, filename)}`);
      if (metadata.isDirectory()) await visit(filename);
      else if (metadata.isFile()) files.push(filename);
      else throw new Error(`Unsupported source entry: ${relativeUnix(repoRoot, filename)}`);
    }
  }
  await visit(root);
  return files;
}

function isTestResource(relativePath) {
  const segments = relativePath.split("/");
  const basename = segments.at(-1);
  return (
    segments.some((segment) => segment === "tests" || segment === "__tests__") ||
    /\.test\.(?:mjs|cjs|js|ts|py|sh|ps1)$/i.test(basename) ||
    /^test_[A-Za-z0-9_]+\.py$/i.test(basename)
  );
}

function replaceExact(content, before, after, label) {
  const first = content.indexOf(before);
  if (first < 0 || content.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Transform ${label} expected exactly one source match`);
  }
  return `${content.slice(0, first)}${after}${content.slice(first + before.length)}`;
}

export function transformPackageDocSecretPlaceholder(input) {
  const content = input.toString("utf8");
  const legacyValue = "neo4j_graph_dev";
  const exactEnvironmentReference = "${NEO4J_PASSWORD}";
  const rawLegacyCount = content.split(legacyValue).length - 1;
  const exactLegacyMatches = [...content.matchAll(/(?<![A-Za-z0-9._-])neo4j_graph_dev(?![A-Za-z0-9._-])/g)];
  if (rawLegacyCount !== exactLegacyMatches.length) {
    throw new Error("Transform package-doc-secret-placeholder rejected an unsafe legacy-secret near-match");
  }
  const rawEnvironmentCount = content.split("${NEO4J_PASSWORD").length - 1;
  const environmentMatches = content.match(/\$\{NEO4J_PASSWORD[^}]*\}/g) ?? [];
  if (rawEnvironmentCount !== environmentMatches.length || environmentMatches.some((value) => value !== exactEnvironmentReference)) {
    throw new Error("Transform package-doc-secret-placeholder rejected an unsafe environment-secret near-match");
  }
  if (exactLegacyMatches.length > 0) {
    return Buffer.from(content.replaceAll(legacyValue, "<generated-by-nacl-local-init>"));
  }
  if (environmentMatches.length > 0) return input;
  throw new Error("Transform package-doc-secret-placeholder expected an exact secret placeholder source match");
}

const TRANSFORMS = {
  "portable-python-temp-log": (input) => {
    let content = input.toString("utf8");
    content = replaceExact(content, "import re\nfrom pathlib import Path", "import re\nimport tempfile\nfrom pathlib import Path", "portable-python-temp-log import");
    content = replaceExact(
      content,
      "# dropped; non-matching tokens are warn-logged to /tmp/ko-sa-parse.log so\n# sentinel characters",
      "# dropped; non-matching tokens are warn-logged under the platform's safe\n# temporary directory so\n# sentinel characters",
      "portable-python-temp-log comment",
    );
    content = replaceExact(content, '_SA_PARSE_LOG = "/tmp/ko-sa-parse.log"', '_SA_PARSE_LOG = Path(tempfile.gettempdir()) / "ko-sa-parse.log"', "portable-python-temp-log path");
    return Buffer.from(content);
  },
  "generic-home-path": (input) => Buffer.from(replaceExact(
    input.toString("utf8"),
    "Never include local `/Users/` paths or dump metadata in the artifact body.",
    "Never include developer-specific home-directory paths or dump metadata in the artifact body.",
    "generic-home-path",
  )),
  "portable-tl-dev-baselines": (input) => {
    let content = input.toString("utf8");
    content = replaceExact(
      content,
      "Store output in `/tmp/TECH-###-baseline.txt` (or equivalent temp location). This baseline is the reference for all subsequent comparisons.",
      "Allocate one safe output path for the whole comparison: POSIX uses `baseline_file=$(mktemp)`; PowerShell uses `$baseline_file = [System.IO.Path]::GetTempFileName()`. Store the output in that same `baseline_file` variable, reuse it for all subsequent comparisons, and remove it after the final comparison.",
      "portable-tl-dev-baselines first",
    );
    content = replaceExact(
      content,
      "Store in `/tmp/TECH-###-baseline.txt`. This is the reference for comparison after the change, and it feeds the verification record written in B.3.5 — do not discard it before that step.",
      "Allocate one safe output path for the whole comparison: POSIX uses `baseline_file=$(mktemp)`; PowerShell uses `$baseline_file = [System.IO.Path]::GetTempFileName()`. Store the output in that same `baseline_file` variable and reuse it for the comparison after the change. It also feeds the verification record written in B.3.5 — remove it only after that record is written.",
      "portable-tl-dev-baselines second",
    );
    return Buffer.from(content);
  },
  "portable-tl-dev-be-baseline": (input) => Buffer.from(replaceExact(
    input.toString("utf8"),
    "Store output in `/tmp/UC###-be-baseline.txt`. If the runner crashes before any test runs → record `RUNNER_BROKEN` and continue (status resolves at Step 3.5).",
    "Allocate one safe output path for the whole comparison: POSIX uses `baseline_file=$(mktemp)`; PowerShell uses `$baseline_file = [System.IO.Path]::GetTempFileName()`. Store the output in that same `baseline_file` variable, reuse it for later comparison, and remove it after the final comparison. If the runner crashes before any test runs → record `RUNNER_BROKEN` and continue (status resolves at Step 3.5).",
    "portable-tl-dev-be-baseline",
  )),
  "portable-tl-dev-fe-baseline": (input) => Buffer.from(replaceExact(
    input.toString("utf8"),
    "Store output in `/tmp/UC###-fe-baseline.txt`. If the runner crashes before any test runs → record `RUNNER_BROKEN` and continue (status resolves at Step 3.5).",
    "Allocate one safe output path for the whole comparison: POSIX uses `baseline_file=$(mktemp)`; PowerShell uses `$baseline_file = [System.IO.Path]::GetTempFileName()`. Store the output in that same `baseline_file` variable, reuse it for later comparison, and remove it after the final comparison. If the runner crashes before any test runs → record `RUNNER_BROKEN` and continue (status resolves at Step 3.5).",
    "portable-tl-dev-fe-baseline",
  )),
  "package-doc-secret-placeholder": transformPackageDocSecretPlaceholder,
  "package-shell-secret-required": (input) => Buffer.from(replaceExact(
    input.toString("utf8"),
    'PASSWORD="neo4j_graph_dev"; DATABASE="neo4j"',
    'PASSWORD="${NEO4J_PASSWORD:-}"; DATABASE="neo4j"',
    "package-shell-secret-required",
  )),
  "package-powershell-secret-required": (input) => Buffer.from(replaceExact(
    input.toString("utf8"),
    '[string]$Password = "neo4j_graph_dev",',
    '[string]$Password = $env:NEO4J_PASSWORD,',
    "package-powershell-secret-required",
  )),
  "package-compose-secret-required": (input) => Buffer.from(replaceExact(
    input.toString("utf8"),
    "NEO4J_AUTH: neo4j/${NEO4J_PASSWORD:-neo4j_graph_dev}",
    "NEO4J_AUTH: neo4j/${NEO4J_PASSWORD:?set NEO4J_PASSWORD through the package secret provider}",
    "package-compose-secret-required",
  )),
  "package-nacl-core-links": (input) => {
    let content = input.toString("utf8");
    content = content.replaceAll("neo4j_graph_dev", "<generated-by-nacl-local-init>");
    content = content.replaceAll("(docs/skill-modifiers.md)", "(../docs/skill-modifiers.md)");
    if (content === input.toString("utf8")) throw new Error("Transform package-nacl-core-links expected a source match");
    return Buffer.from(content);
  },
  "package-generic-checkout-example": (input) => {
    const content = input.toString("utf8");
    const genericCheckout = `/${["home", "project-owner", "projects", "NaCl"].join("/")}/`;
    if (!content.includes(genericCheckout)) throw new Error("Transform package-generic-checkout-example expected a source match");
    return Buffer.from(content.replaceAll(genericCheckout, "<NaCl-checkout>/"));
  },
  "package-closed-release-status": (input) => Buffer.from(replaceExact(
    input.toString("utf8"),
    "`Status: FAIL` with at least one finding at `severity: CRITICAL`",
    "`Status: FAILED` with at least one finding at `severity: CRITICAL`",
    "package-closed-release-status",
  )),
};

async function loadManifest(filename) {
  await assertRepoSource(filename, "file", "Manifest");
  const manifest = JSON.parse(await readFile(filename, "utf8"));
  if (manifest.schemaVersion !== 1) throw new Error(`Unsupported manifest schema: ${manifest.schemaVersion}`);
  if (!Array.isArray(manifest.rootPackages) || new Set(manifest.rootPackages).size !== manifest.rootPackages.length) {
    throw new Error("rootPackages must be a unique array");
  }
  const overlayNames = manifest.workflowOverlays.map((item) => item.workflow);
  if (new Set(overlayNames).size !== overlayNames.length) throw new Error("workflow overlays must be unique");
  const historicalKeys = manifest.historicalLegacyTargets.map((item) => `${item.workflow}:${item.sha256}`);
  if (new Set(historicalKeys).size !== historicalKeys.length) throw new Error("historical legacy targets must be unique");
  for (const transform of manifest.transforms) {
    if (!TRANSFORMS[transform.name]) throw new Error(`Unknown transform: ${transform.name}`);
  }
  return manifest;
}

async function sha256(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

async function buildInto(destination, manifest) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true, mode: 0o755 });
  const origins = new Map();
  const transforms = new Map(manifest.transforms.map((item) => [item.path, item.name]));

  async function copyFile(source, relativeDestination, origin) {
    if (path.isAbsolute(relativeDestination) || relativeDestination.startsWith("../") || relativeDestination.includes("/../")) {
      throw new Error(`Destination escapes package: ${relativeDestination}`);
    }
    if (origins.has(relativeDestination)) {
      throw new Error(`Duplicate package destination: ${relativeDestination} from ${origins.get(relativeDestination)} and ${origin}`);
    }
    origins.set(relativeDestination, origin);
    await assertRepoSource(source, "file", "Package source");
    const target = path.join(destination, ...relativeDestination.split("/"));
    if (!inside(destination, target)) throw new Error(`Destination escapes package: ${relativeDestination}`);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    const transform = transforms.get(relativeDestination);
    const content = transform ? TRANSFORMS[transform](await readFile(source)) : await readFile(source);
    await writeFile(target, content, { mode: 0o644 });
    await chmod(target, 0o644);
  }

  async function copyTree(sourceRoot, relativeDestination, origin, filter = () => true) {
    await assertRepoSource(sourceRoot, "directory", "Package source root");
    const files = await filesUnder(sourceRoot);
    for (const source of files) {
      const relativeSource = relativeUnix(sourceRoot, source);
      if (!filter(relativeSource)) continue;
      const target = relativeDestination ? `${relativeDestination}/${relativeSource}` : relativeSource;
      await copyFile(source, target, `${origin}:${relativeSource}`);
    }
  }

  for (const packageName of manifest.rootPackages) {
    const source = repoPath(packageName);
    await assertRepoSource(source, "directory", "Root package");
    await copyTree(source, `resources/${packageName}`, `root:${packageName}`, (relativePath) => !isTestResource(relativePath));
  }

  for (const tree of manifest.sharedTrees) {
    await copyTree(repoPath(tree.source), tree.destination, `shared-tree:${tree.source}`);
  }
  for (const file of manifest.sharedFiles) {
    await copyFile(repoPath(file.source), file.destination, `shared-file:${file.source}`);
  }

  const workflowRoot = repoPath(manifest.workflowSource);
  await assertRepoSource(workflowRoot, "directory", "Workflow source");
  const workflowEntries = (await readdir(workflowRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("nacl-"))
    .map((entry) => entry.name)
    .sort();
  const overlayNames = new Set(manifest.workflowOverlays.map((item) => item.workflow));
  for (const workflow of workflowEntries) {
    const workflowDirectory = path.join(workflowRoot, workflow);
    await copyTree(
      workflowDirectory,
      `${manifest.workflowDestination}/${workflow}`,
      `legacy-codex-resources:${workflow}`,
      (relativePath) => relativePath !== "SKILL.md" && !isTestResource(relativePath),
    );
    const source = overlayNames.has(workflow)
      ? repoPath(`codex-plugin-src/workflow-overlays/${workflow}/SKILL.md`)
      : path.join(workflowRoot, workflow, "SKILL.md");
    await copyFile(source, `${manifest.workflowDestination}/${workflow}/SKILL.md`, overlayNames.has(workflow) ? `codex-overlay:${workflow}` : `legacy-codex:${workflow}`);
  }
  for (const overlay of overlayNames) {
    if (!workflowEntries.includes(overlay)) throw new Error(`Overlay has no legacy workflow source: ${overlay}`);
  }

  await copyTree(repoPath(manifest.codexSource), "", "codex-source");

  const publicEntrySkills = (await readdir(path.join(destination, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const internalWorkflows = workflowEntries;
  const packageIndexTemplate = repoPath(manifest.packageIndexTemplate);
  await assertRepoSource(packageIndexTemplate, "file", "Package index template");
  const template = JSON.parse(await readFile(packageIndexTemplate, "utf8"));
  const packageIndex = { ...template, publicEntrySkills, internalWorkflows };
  const indexPath = path.join(destination, "resources", "package-index.json");
  await writeFile(indexPath, `${JSON.stringify(packageIndex, null, 2)}\n`, { mode: 0o644 });
  origins.set("resources/package-index.json", `generated:${manifest.packageIndexTemplate}`);

  const divergences = [];
  let byteIdenticalCount = 0;
  for (const workflow of internalWorkflows) {
    const packaged = path.join(destination, "resources", "workflows", workflow, "SKILL.md");
    const legacy = path.join(workflowRoot, workflow, "SKILL.md");
    const [packagedSha256, codexRootSha256] = await Promise.all([sha256(packaged), sha256(legacy)]);
    if (packagedSha256 === codexRootSha256) byteIdenticalCount += 1;
    else {
      const definition = manifest.workflowOverlays.find((item) => item.workflow === workflow);
      if (!definition) throw new Error(`Unrecorded workflow divergence: ${workflow}`);
      divergences.push({ workflow, packagedSha256, codexRootSha256, reason: definition.reason });
    }
  }
  const parity = {
    schemaVersion: 2,
    sourceChain: "root -> skills-for-codex -> plugins/nacl",
    codexRootWorkflowCount: internalWorkflows.length,
    byteIdenticalCount,
    deliberateDivergences: divergences,
    historicalLegacyTargets: manifest.historicalLegacyTargets,
  };
  const parityPath = path.join(destination, "resources", "references", "workflow-parity-baseline.json");
  await writeFile(parityPath, `${JSON.stringify(parity, null, 2)}\n`, { mode: 0o644 });
  origins.set("resources/references/workflow-parity-baseline.json", "generated:workflow-projection");

  const expectedTransforms = new Set(transforms.keys());
  for (const transformedPath of expectedTransforms) {
    if (!origins.has(transformedPath)) throw new Error(`Transform target was not generated: ${transformedPath}`);
  }
  for (const [field, values] of Object.entries(packageIndex)) {
    if (!Array.isArray(values)) continue;
    if (field === "publicEntrySkills" || field === "internalWorkflows") continue;
    for (const filename of values) {
      const target = path.join(destination, filename);
      if (!inside(destination, target)) throw new Error(`Package index ${field} escapes package: ${filename}`);
      const metadata = await stat(target).catch(() => null);
      if (!metadata?.isFile()) throw new Error(`Package index ${field} is missing: ${filename}`);
    }
  }
  return { fileCount: origins.size, publicCount: publicEntrySkills.length, workflowCount: internalWorkflows.length };
}

async function treeManifest(root) {
  const files = await filesUnder(root);
  const records = [];
  for (const filename of files) {
    const metadata = await stat(filename);
    records.push({
      path: relativeUnix(root, filename),
      mode: metadata.mode & 0o777,
      sha256: await sha256(filename),
    });
  }
  return records;
}

async function compareTrees(left, right) {
  const [leftManifest, rightManifest] = await Promise.all([treeManifest(left), treeManifest(right)]);
  return { equal: JSON.stringify(leftManifest) === JSON.stringify(rightManifest), leftManifest, rightManifest };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const binding = productionBinding(options);
  const manifest = await loadManifest(options.manifest);
  const committedOutput = repoPath(manifest.output);
  if (options.output && inside(repoRoot, options.output) && path.resolve(options.output) !== committedOutput) {
    throw new Error(`External build output must not write elsewhere in the repository: ${options.output}`);
  }
  if (binding && inside(repoRoot, options.output)) {
    throw new Error("Production binding output must be outside the repository");
  }
  const destination = options.output ?? committedOutput;
  if (!options.check) await mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
  const temporaryRoot = await mkdtemp(path.join(options.check ? os.tmpdir() : path.dirname(destination), ".nacl-codex-build-"));
  const staging = path.join(temporaryRoot, "nacl");
  try {
    const result = await buildInto(staging, manifest);
    if (binding) {
      await applyProductionBinding(staging, binding);
      result.fileCount += 1;
    }
    if (options.check) {
      const comparison = await compareTrees(staging, committedOutput).catch(() => ({ equal: false }));
      if (!comparison.equal) {
        console.error("plugins/nacl is out of date with scripts/build-codex-plugin.mjs output.");
        process.exitCode = 1;
        return;
      }
      console.log(`plugins/nacl is up to date (${result.fileCount} files, ${result.publicCount} public skills, ${result.workflowCount} workflows).`);
      return;
    }
    const backup = `${destination}.codex-build-backup`;
    const destinationExists = await stat(destination).then(() => true, (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
    const backupExists = await stat(backup).then(() => true, (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
    if (!destinationExists && backupExists) await rename(backup, destination);
    else if (destinationExists && backupExists) throw new Error(`Stale builder backup requires review: ${backup}`);
    const hasDestination = await stat(destination).then(() => true, () => false);
    if (hasDestination) await rename(destination, backup);
    try {
      if (process.env.CODEX_BUILDER_TEST_MODE === "1" && process.env.NACL_CODEX_BUILDER_FAILURE_INJECTION === "after-backup") {
        throw new Error("Injected failure after backup");
      }
      await rename(staging, destination);
      if (hasDestination) await rm(backup, { recursive: true, force: true });
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      if (hasDestination) await rename(backup, destination);
      throw error;
    }
    console.log(`Built ${relativeUnix(repoRoot, destination)} (${result.fileCount} files, ${result.publicCount} public skills, ${result.workflowCount} workflows).`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const invokedScriptPath = process.argv[1]
  ? await realpath(process.argv[1]).catch(() => path.resolve(process.argv[1]))
  : null;
if (invokedScriptPath === canonicalScriptPath) await main();
