import { lstat, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

async function validPluginManifest(pluginRoot) {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
    );
    return manifest?.name === "nacl" && typeof manifest.version === "string";
  } catch {
    return false;
  }
}

function legacySkillName(content) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return frontmatter?.[1].match(/^name:\s*([a-z0-9-]+)\s*$/m)?.[1] ?? null;
}

async function legacyEntries(home) {
  const skillRoot = path.join(home, ".agents", "skills");
  let entries;
  try {
    entries = await readdir(skillRoot, { withFileTypes: true });
  } catch {
    return { invalid: [], valid: [] };
  }

  const invalid = [];
  const valid = [];
  for (const entry of entries) {
    if (!/^nacl(?:-|$)/.test(entry.name)) continue;
    const candidate = path.join(skillRoot, entry.name);
    try {
      const metadata = await lstat(candidate);
      if (!metadata.isDirectory() && !metadata.isSymbolicLink()) {
        invalid.push({ name: entry.name, reason: "not-a-directory-or-symlink" });
        continue;
      }
    } catch {
      invalid.push({ name: entry.name, reason: "artifact-unreadable" });
      continue;
    }
    try {
      const target = await stat(candidate);
      if (!target.isDirectory()) {
        invalid.push({ name: entry.name, reason: "target-not-a-directory" });
        continue;
      }
    } catch {
      invalid.push({ name: entry.name, reason: "target-unresolvable" });
      continue;
    }
    const skillPath = path.join(candidate, "SKILL.md");
    let content;
    try {
      const skill = await stat(skillPath);
      if (!skill.isFile()) {
        invalid.push({ name: entry.name, reason: "skill-not-a-regular-file" });
        continue;
      }
      content = await readFile(skillPath, "utf8");
    } catch {
      invalid.push({ name: entry.name, reason: "skill-missing-or-unreadable" });
      continue;
    }
    if (legacySkillName(content) !== entry.name) {
      invalid.push({ name: entry.name, reason: "skill-frontmatter-name-mismatch" });
      continue;
    }
    valid.push(entry.name);
  }
  return {
    invalid: invalid.sort((left, right) => left.name.localeCompare(right.name)),
    valid: valid.sort(),
  };
}

function resultFor(pluginPresent, installedLegacyEntries, invalidLegacyEntries) {
  if (invalidLegacyEntries.length > 0) {
    return {
      mode: "invalid-legacy-artifacts",
      status: "FAILED",
      guidance:
        "Invalid nacl-* legacy artifacts were found. Remove or repair only the listed entries so each resolves to a directory with a readable SKILL.md whose frontmatter name matches the entry, then start a new task.",
    };
  }
  if (pluginPresent && installedLegacyEntries.length === 0) {
    return {
      mode: "plugin-only",
      status: "VERIFIED",
      guidance: "Use the nacl plugin entry skills. No legacy cleanup is required.",
    };
  }
  if (!pluginPresent && installedLegacyEntries.length > 0) {
    return {
      mode: "legacy-only",
      status: "VERIFIED",
      guidance: "Use the legacy nacl-* skills. Install the plugin only after removing those symlinks.",
    };
  }
  if (pluginPresent && installedLegacyEntries.length > 0) {
    return {
      mode: "both",
      status: "FAILED",
      guidance:
        "Ambiguous NaCl installation: remove the nacl plugin or remove only the legacy nacl-* symlinks, then start a new task. Do not run a workflow until one mode remains.",
    };
  }
  return {
    mode: "neither",
    status: "BLOCKED",
    guidance:
      "Install NaCl from the Codex Plugins UI or run the repository legacy symlink installer, then start a new task.",
  };
}

export async function diagnoseInstallation({ pluginRoot, home }) {
  const [pluginPresent, installedLegacy] = await Promise.all([
    validPluginManifest(pluginRoot),
    legacyEntries(home),
  ]);
  return {
    contract: "nacl-codex-installation-v1",
    ...resultFor(pluginPresent, installedLegacy.valid, installedLegacy.invalid),
    pluginPresent,
    legacyPresent: installedLegacy.valid.length > 0,
    legacyArtifactPresent: installedLegacy.valid.length + installedLegacy.invalid.length > 0,
    legacyEntryCount: installedLegacy.valid.length,
    legacyEntries: installedLegacy.valid,
    invalidLegacyEntryCount: installedLegacy.invalid.length,
    invalidLegacyEntries: installedLegacy.invalid,
    executionLocation: pluginRoot.split(path.sep).join("/").includes("/plugins/cache/")
      ? "installed-cache"
      : "source-or-disposable-copy",
  };
}
