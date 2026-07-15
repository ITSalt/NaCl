#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmod,
  cp,
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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultManifest = path.join(repoRoot, "scripts", "codex-plugin-manifest.json");

function parseArgs(argv) {
  const options = { check: false, manifest: defaultManifest, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--manifest") options.manifest = path.resolve(argv[++index] ?? "");
    else if (argument === "--output") options.output = path.resolve(argv[++index] ?? "");
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.manifest) throw new Error("--manifest requires a path");
  if (options.check && options.output) throw new Error("--check and --output are mutually exclusive");
  return options;
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
  return segments.includes("tests") || /(?:^|[._-])test(?:[._-]|$)/i.test(basename) || /^test[._-]/i.test(basename);
}

function replaceExact(content, before, after, label) {
  const first = content.indexOf(before);
  if (first < 0 || content.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Transform ${label} expected exactly one source match`);
  }
  return `${content.slice(0, first)}${after}${content.slice(first + before.length)}`;
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
      "Store in `/tmp/TECH-###-baseline.txt`. This is the reference for comparison after the change.",
      "Allocate one safe output path for the whole comparison: POSIX uses `baseline_file=$(mktemp)`; PowerShell uses `$baseline_file = [System.IO.Path]::GetTempFileName()`. Store the output in that same `baseline_file` variable, reuse it for the comparison after the change, and remove it after that comparison.",
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
};

async function loadManifest(filename) {
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
    const target = path.join(destination, ...relativeDestination.split("/"));
    if (!inside(destination, target)) throw new Error(`Destination escapes package: ${relativeDestination}`);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    const transform = transforms.get(relativeDestination);
    const content = transform ? TRANSFORMS[transform](await readFile(source)) : await readFile(source);
    await writeFile(target, content, { mode: 0o644 });
    await chmod(target, 0o644);
  }

  async function copyTree(sourceRoot, relativeDestination, origin, filter = () => true) {
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
    const metadata = await stat(source);
    if (!metadata.isDirectory()) throw new Error(`Root package is not a directory: ${packageName}`);
    await copyTree(source, `resources/${packageName}`, `root:${packageName}`, (relativePath) => !isTestResource(relativePath));
  }

  for (const tree of manifest.sharedTrees) {
    await copyTree(repoPath(tree.source), tree.destination, `shared-tree:${tree.source}`);
  }
  for (const file of manifest.sharedFiles) {
    await copyFile(repoPath(file.source), file.destination, `shared-file:${file.source}`);
  }

  const workflowRoot = repoPath(manifest.workflowSource);
  const workflowEntries = (await readdir(workflowRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("nacl-"))
    .map((entry) => entry.name)
    .sort();
  const overlayNames = new Set(manifest.workflowOverlays.map((item) => item.workflow));
  for (const workflow of workflowEntries) {
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
  const template = JSON.parse(await readFile(repoPath(manifest.packageIndexTemplate), "utf8"));
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
  const manifest = await loadManifest(options.manifest);
  const committedOutput = repoPath(manifest.output);
  if (options.output && inside(repoRoot, options.output) && path.resolve(options.output) !== committedOutput) {
    throw new Error(`External build output must not write elsewhere in the repository: ${options.output}`);
  }
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-codex-build-"));
  const staging = path.join(temporaryRoot, "nacl");
  try {
    const result = await buildInto(staging, manifest);
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
    const destination = options.output ?? committedOutput;
    await rm(destination, { recursive: true, force: true });
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
    try {
      await rename(staging, destination);
    } catch (error) {
      if (error.code !== "EXDEV") throw error;
      await cp(staging, destination, { recursive: true, force: false, errorOnExist: true });
    }
    console.log(`Built ${relativeUnix(repoRoot, destination)} (${result.fileCount} files, ${result.publicCount} public skills, ${result.workflowCount} workflows).`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
