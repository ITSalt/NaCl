import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const validatorScript = path.join(
  repoRoot,
  "scripts",
  "validate-codex-skills.py",
);
const skillsRoot = path.join(repoRoot, "skills-for-codex");
const vendorRoot = path.join(
  repoRoot,
  "tests",
  "codex-plugin",
  "vendor",
  "openai-codex",
  "4aa950d456c6c90174d3269d7eaab4a2823e5889",
);
const vendorHashes = new Map([
  [
    "quick_validate.py",
    "6cc9dc3199c935916cf6f73fcbbbb0e3bb1b58c8f5109fefa499978908164f51",
  ],
  [
    "LICENSE",
    "d17f227e4df5da1600391338865ce0f3055211760a36688f816941d58232d8dc",
  ],
  [
    "NOTICE",
    "9d71575ecfd9a843fc1677b0efb08053c6ba9fd686a0de1a6f5382fd3c220915",
  ],
]);

function skillName(index) {
  return `nacl-fixture-${String(index).padStart(2, "0")}`;
}

function skillContent(name, description = "Example Codex skill.") {
  return `---
name: ${name}
description: ${description}
---

# Fixture
`;
}

async function createSkillsRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-skill-validator-"));
  for (let index = 0; index < 60; index += 1) {
    const name = skillName(index);
    const skillDirectory = path.join(root, name);
    await mkdir(skillDirectory);
    await writeFile(
      path.join(skillDirectory, "SKILL.md"),
      skillContent(name),
    );
  }
  return root;
}

async function snapshotTree(root) {
  const snapshot = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path
        .relative(root, absolutePath)
        .split(path.sep)
        .join("/");
      if (entry.isDirectory()) {
        snapshot.push([relativePath, "directory"]);
        await walk(absolutePath);
      } else if (entry.isFile()) {
        const bytes = await readFile(absolutePath);
        snapshot.push([relativePath, "file", bytes.toString("hex")]);
      } else {
        throw new Error(`unexpected fixture path type: ${relativePath}`);
      }
    }
  }

  await walk(root);
  return snapshot;
}

function runValidator(
  root,
  {
    python = "python3",
    script = validatorScript,
    env = {},
  } = {},
) {
  const result = spawnSync(python, [script, "--root", root], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return {
    ...result,
    combined: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

function resolvePinnedPyYAML() {
  const probeScript = [
    "import json",
    "import sys",
    "from pathlib import Path",
    "import yaml",
    "module_path = Path(yaml.__file__).resolve()",
    "metadata = {}",
    "metadata['executable'] = sys.executable",
    "metadata['version'] = yaml.__version__",
    "metadata['module_path'] = str(module_path)",
    "metadata['site_packages'] = str(module_path.parent.parent)",
    "print(json.dumps(metadata))",
  ].join("; ");
  const probe = spawnSync("python3", ["-c", probeScript], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
  const combined = `${probe.stdout ?? ""}\n${probe.stderr ?? ""}`;
  assert.equal(probe.status, 0, combined);

  const resolved = JSON.parse(probe.stdout);
  assert.equal(resolved.version, "6.0.3");
  assert.equal(path.isAbsolute(resolved.executable), true);
  assert.equal(path.isAbsolute(resolved.module_path), true);
  assert.equal(path.isAbsolute(resolved.site_packages), true);
  assert.equal(
    path.dirname(path.dirname(resolved.module_path)),
    resolved.site_packages,
  );
  return resolved;
}

test("uses the vendored validator to cover exactly all 60 Codex skills", () => {
  const result = runValidator(skillsRoot);

  assert.equal(result.status, 0, result.combined);
  assert.match(result.combined, /Validated count: 60/);
  assert.match(result.combined, /Status: VERIFIED/);
  assert.equal(
    result.stdout.split("\n").filter((line) => line.startsWith("CHECKED ")).length,
    60,
  );
});

test("rejects malformed YAML instead of accepting a parser approximation", async () => {
  const root = await createSkillsRoot();
  await writeFile(
    path.join(root, skillName(0), "SKILL.md"),
    skillContent(skillName(0), "[not, valid"),
  );

  const result = runValidator(root);

  assert.equal(result.status, 1, result.combined);
  assert.match(result.combined, /Invalid YAML in frontmatter/);
  assert.match(result.combined, /Status: FAILED/);
});

test("rejects an unquoted YAML date and accepts the quoted date", async () => {
  const root = await createSkillsRoot();
  const skillFile = path.join(root, skillName(0), "SKILL.md");
  await writeFile(skillFile, skillContent(skillName(0), "2026-07-14"));

  const unquoted = runValidator(root);
  assert.equal(unquoted.status, 1, unquoted.combined);
  assert.match(unquoted.combined, /Description must be a string, got date/);

  await writeFile(skillFile, skillContent(skillName(0), '"2026-07-14"'));
  const quoted = runValidator(root);
  assert.equal(quoted.status, 0, quoted.combined);
  assert.match(quoted.combined, /Status: VERIFIED/);
});

test("rejects YAML list, map, bool, null, int, and float descriptions", async () => {
  const root = await createSkillsRoot();
  const skillFile = path.join(root, skillName(0), "SKILL.md");
  const nonStrings = [
    "[not, a, string]",
    "{not: a-string}",
    "true",
    "null",
    "42",
    "3.14",
  ];

  for (const value of nonStrings) {
    await writeFile(skillFile, skillContent(skillName(0), value));
    const result = runValidator(root);
    assert.equal(result.status, 1, `${value}\n${result.combined}`);
    assert.match(
      result.combined,
      /Description must be a string, got (list|dict|bool|NoneType|int|float)/,
      value,
    );
  }
});

test("reports BLOCKED when pinned PyYAML is unavailable", () => {
  const result = spawnSync(
    "python3",
    ["-S", validatorScript, "--root", skillsRoot],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  assert.equal(result.status, 2, combined);
  assert.match(combined, /PyYAML 6\.0\.3 is required but is not installed/);
  assert.match(combined, /Status: BLOCKED/);
});

test("does not depend on HOME or CODEX_HOME for the validator snapshot", async () => {
  const pinnedPyYAML = resolvePinnedPyYAML();
  const emptyHome = await mkdtemp(path.join(os.tmpdir(), "nacl-empty-home-"));
  const result = runValidator(skillsRoot, {
    python: pinnedPyYAML.executable,
    env: {
      HOME: emptyHome,
      CODEX_HOME: path.join(emptyHome, "codex-home"),
      PYTHONPATH: pinnedPyYAML.site_packages,
    },
  });

  assert.equal(result.status, 0, result.combined);
  assert.match(result.combined, /Status: VERIFIED/);
});

test("validation is recursively byte-for-byte read-only across repeated runs", async () => {
  const isolatedRepo = await mkdtemp(
    path.join(os.tmpdir(), "nacl-validator-read-only-"),
  );
  const isolatedScript = path.join(
    isolatedRepo,
    "scripts",
    "validate-codex-skills.py",
  );
  const isolatedVendor = path.join(
    isolatedRepo,
    "tests",
    "codex-plugin",
    "vendor",
    "openai-codex",
    "4aa950d456c6c90174d3269d7eaab4a2823e5889",
  );
  const isolatedSkills = path.join(isolatedRepo, "skills-for-codex");
  await mkdir(path.dirname(isolatedScript), { recursive: true });
  await mkdir(isolatedVendor, { recursive: true });
  await mkdir(isolatedSkills);
  await copyFile(validatorScript, isolatedScript);
  for (const filename of vendorHashes.keys()) {
    await copyFile(
      path.join(vendorRoot, filename),
      path.join(isolatedVendor, filename),
    );
  }
  for (let index = 0; index < 60; index += 1) {
    const name = skillName(index);
    const skillDirectory = path.join(isolatedSkills, name);
    await mkdir(skillDirectory);
    await writeFile(
      path.join(skillDirectory, "SKILL.md"),
      skillContent(name),
    );
  }

  const before = await snapshotTree(isolatedRepo);
  assert.equal(
    before.some(([relativePath]) => relativePath.includes("__pycache__")),
    false,
  );

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = runValidator(isolatedSkills, {
      script: isolatedScript,
    });
    assert.equal(result.status, 0, `attempt ${attempt}\n${result.combined}`);
    assert.match(result.combined, /Status: VERIFIED/);

    const after = await snapshotTree(isolatedRepo);
    assert.deepEqual(after, before, `filesystem changed on attempt ${attempt}`);
    assert.equal(
      after.some(([relativePath]) => relativePath.includes("__pycache__")),
      false,
    );
  }
});

test("blocks a one-byte validator change before dependency import", async () => {
  const isolatedRepo = await mkdtemp(
    path.join(os.tmpdir(), "nacl-validator-tamper-"),
  );
  const isolatedScript = path.join(
    isolatedRepo,
    "scripts",
    "validate-codex-skills.py",
  );
  const isolatedVendor = path.join(
    isolatedRepo,
    "tests",
    "codex-plugin",
    "vendor",
    "openai-codex",
    "4aa950d456c6c90174d3269d7eaab4a2823e5889",
  );
  await mkdir(path.dirname(isolatedScript), { recursive: true });
  await mkdir(isolatedVendor, { recursive: true });
  await copyFile(validatorScript, isolatedScript);
  for (const filename of vendorHashes.keys()) {
    await copyFile(
      path.join(vendorRoot, filename),
      path.join(isolatedVendor, filename),
    );
  }

  const tamperedPath = path.join(isolatedVendor, "quick_validate.py");
  const tamperedBytes = await readFile(tamperedPath);
  tamperedBytes[0] ^= 1;
  await writeFile(tamperedPath, tamperedBytes);

  const result = spawnSync(
    "python3",
    ["-S", isolatedScript, "--root", skillsRoot],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  assert.equal(result.status, 2, combined);
  assert.match(combined, /quick_validate\.py checksum mismatch/);
  assert.doesNotMatch(combined, /PyYAML/);
  assert.match(combined, /Status: BLOCKED/);
});

test("preserves exact upstream validator, LICENSE, and NOTICE hashes", async () => {
  for (const [filename, expectedHash] of vendorHashes) {
    const bytes = await readFile(path.join(vendorRoot, filename));
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    assert.equal(actualHash, expectedHash, filename);
  }
});

test("fails count drift caused by an immediate non-nacl skill directory", async () => {
  const root = await createSkillsRoot();
  const otherDirectory = path.join(root, "other");
  await mkdir(otherDirectory);
  await writeFile(
    path.join(otherDirectory, "SKILL.md"),
    skillContent("other"),
  );

  const result = runValidator(root);

  assert.equal(result.status, 1, result.combined);
  assert.match(result.combined, /Expected exactly 60 Codex skills, found 61/);
  assert.match(result.combined, /CHECKED .*\/other\/SKILL\.md/);
  assert.match(result.combined, /Status: FAILED/);
});

test("fails when the declared skill name differs from its directory", async () => {
  const root = await createSkillsRoot();
  await writeFile(
    path.join(root, skillName(0), "SKILL.md"),
    skillContent("nacl-wrong-name"),
  );

  const result = runValidator(root);

  assert.equal(result.status, 1, result.combined);
  assert.match(
    result.combined,
    /Name 'nacl-wrong-name' does not match skill directory 'nacl-fixture-00'/,
  );
  assert.match(result.combined, /Status: FAILED/);
});
