#!/usr/bin/env node
// build-plugin.mjs — deterministically builds the Claude Code Desktop plugin
// (plugin/) from the repo's root nacl-* skills, per scripts/plugin-manifest.json.
//
// Usage:
//   node scripts/build-plugin.mjs                 # build into <root>/plugin
//   node scripts/build-plugin.mjs --check          # build into a temp dir and
//                                                   # byte-compare against the
//                                                   # committed plugin/ (no writes)
//   node scripts/build-plugin.mjs --root <dir>     # override repo root (tests)
//
// Zero runtime dependencies. Node >= 20, ESM.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** Parse the newest version from a CHANGELOG.md ("## [X.Y.Z] — date" headings). */
export function parseChangelogVersion(text) {
  const m = text.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  if (!m) throw new Error("could not find a '## [X.Y.Z]' heading in CHANGELOG.md");
  return m[1];
}

/** R1: rewrite the `name: nacl-<x>` line inside the FIRST YAML frontmatter block only. */
export function applyR1(text) {
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return { text, count: 0 };
  const frontmatter = fmMatch[0];
  let count = 0;
  const rewritten = frontmatter.replace(/^name: nacl-([A-Za-z0-9-]+)$/m, (m, rest) => {
    count++;
    return `name: ${rest}`;
  });
  if (count === 0) return { text, count: 0 };
  return { text: text.slice(0, fmMatch[0].length).replace(frontmatter, rewritten) + text.slice(fmMatch[0].length), count };
}

const R2_NEEDLE = 'REPO_ROOT="$(cd -P "$HOME/.claude/skills/nacl-init" 2>/dev/null && cd .. && pwd)"';
const R2_REPLACEMENT = 'REPO_ROOT="${CLAUDE_PLUGIN_ROOT}"';

/** R2: exact bash REPO_ROOT resolution line -> ${CLAUDE_PLUGIN_ROOT}. */
export function applyR2(text) {
  const count = countOccurrences(text, R2_NEEDLE);
  if (count === 0) return { text, count };
  return { text: text.split(R2_NEEDLE).join(R2_REPLACEMENT), count };
}

const R3_BLOCK = [
  '$link   = Join-Path $env:USERPROFILE ".claude\\skills\\nacl-init"',
  '$target = (Get-Item $link).Target | Select-Object -First 1',
  'if (-not $target) { $target = (Get-Item $link).FullName }',
  '$RepoRoot = Split-Path $target -Parent',
].join("\n");
const R3_REPLACEMENT = '$RepoRoot = "${CLAUDE_PLUGIN_ROOT}"';

/** R3: PowerShell junction-resolution block -> single ${CLAUDE_PLUGIN_ROOT} assignment. */
export function applyR3(text) {
  const count = countOccurrences(text, R3_BLOCK);
  if (count === 0) return { text, count };
  return { text: text.split(R3_BLOCK).join(R3_REPLACEMENT), count };
}

const R4_NEEDLE = "$HOME/.claude/skills/nacl-core/scripts/graph-doctor.mjs";

/** R4: full graph-doctor.mjs path, carrier-aware. */
export function applyR4(text, carrier) {
  const count = countOccurrences(text, R4_NEEDLE);
  if (count === 0) return { text, count };
  const replacement =
    carrier === "substituted"
      ? "${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/graph-doctor.mjs"
      : "$(nacl-home)/nacl-core/scripts/graph-doctor.mjs";
  return { text: text.split(R4_NEEDLE).join(replacement), count };
}

/** R5: detect leftover `$HOME/.claude/skills/...` references (after R2/R4 already applied). */
export function detectR5(text) {
  const re = /\$HOME\/\.claude\/skills\/[A-Za-z0-9._-]+/g;
  const hits = text.match(re) || [];
  return hits;
}

const R6_RE = /\(\.\.\/(nacl-core|nacl-tl-core)\//g;

/** R6: markdown-link-style relative lib references `(../nacl-core/...)`, carrier-aware. */
export function applyR6(text, carrier) {
  let count = 0;
  const out = text.replace(R6_RE, (m, lib) => {
    count++;
    const base = carrier === "substituted" ? "${CLAUDE_PLUGIN_ROOT}" : "$(nacl-home)";
    return `(${base}/${lib}/`;
  });
  return { text: out, count };
}

// token-start bare `nacl-core/` / `nacl-tl-core/`: not preceded by
// [A-Za-z0-9_/.$}-] (so "../nacl-core/", "${CLAUDE_PLUGIN_ROOT}/nacl-core/",
// "$(nacl-home)/nacl-core/" are left alone).
const R7_RE = /(^|[^A-Za-z0-9_/.$}-])(nacl-core\/|nacl-tl-core\/)/g;

/** R7: bare lib-dir token references, .md files only, carrier-aware. */
export function applyR7(text, carrier) {
  let count = 0;
  const base = carrier === "substituted" ? "${CLAUDE_PLUGIN_ROOT}" : "$(nacl-home)";
  const out = text.replace(R7_RE, (m, pre, lib) => {
    count++;
    return `${pre}${base}/${lib}`;
  });
  return { text: out, count };
}

/**
 * R-goal: delete /goal-only sections (heading matching /^#{2,3} .*\/goal/i through
 * the next heading of same-or-higher level) and standalone `nacl-goal/checks/` lines.
 */
export function applyRGoal(text) {
  const lines = text.split("\n");
  const headingRe = /^(#{2,3})\s.*\/goal/i;
  const anyHeadingRe = /^(#{1,6})\s/;
  const out = [];
  let sectionCount = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const hm = line.match(headingRe);
    if (hm) {
      sectionCount++;
      const level = hm[1].length;
      i++;
      while (i < lines.length) {
        const am = lines[i].match(anyHeadingRe);
        if (am && am[1].length <= level) break;
        i++;
      }
      continue;
    }
    out.push(line);
    i++;
  }
  let standaloneCount = 0;
  const filtered = out.filter((line) => {
    if (/nacl-goal\/checks\//.test(line)) {
      standaloneCount++;
      return false;
    }
    return true;
  });
  return { text: filtered.join("\n"), sectionCount, standaloneCount };
}

const R8_SH_NEEDLE = "graph-infra/scripts/install-sidecar.sh";
const R8_PS1_NEEDLE = "graph-infra/scripts/install-sidecar.ps1";
const R8_VPS_NEEDLE = "graph-infra/vps/provision-vps.sh";

/** R8: framework-copy graph-infra references (narrow allowlist), carrier-aware. */
export function applyR8(text, carrier) {
  let count = 0;
  let out = text;
  for (const needle of [R8_SH_NEEDLE, R8_PS1_NEEDLE]) {
    const n = countOccurrences(out, needle);
    if (n > 0) {
      count += n;
      const rel = needle.slice("graph-infra/".length);
      const replacement =
        carrier === "substituted"
          ? `\${CLAUDE_PLUGIN_ROOT}/graph-infra/${rel}`
          : `$(nacl-home)/graph-infra/${rel}`;
      out = out.split(needle).join(replacement);
    }
  }
  const vpsWarnings = countOccurrences(out, R8_VPS_NEEDLE);
  return { text: out, count, vpsWarnings };
}

/** R10: `/nacl-<name>` slash invocations for INCLUDED roster names -> `/nacl:<name>`. */
export function applyR10Slash(text, rosterStripped) {
  const sorted = [...rosterStripped].sort((a, b) => b.length - a.length);
  let count = 0;
  let out = text;
  for (const name of sorted) {
    const re = new RegExp(`(^|[\\s\`"'(|>])\\/nacl-${escapeRe(name)}(?![a-z0-9-])`, "g");
    out = out.replace(re, (m, pre) => {
      count++;
      return `${pre}/nacl:${name}`;
    });
  }
  return { text: out, count };
}

const AGENT_NAMES = ["analyst", "developer", "diagnostician", "operator", "scout", "strategist", "verifier"];

/** R10b: `subagent_type: "<agent>"` / `subagent_type: <agent>` -> `nacl:<agent>`. */
export function applyR10SubagentType(text) {
  let count = 0;
  let out = text;
  for (const name of AGENT_NAMES) {
    const re = new RegExp(`subagent_type:\\s*"?${name}"?`, "g");
    out = out.replace(re, (m) => {
      count++;
      return m.includes('"') ? `subagent_type: "nacl:${name}"` : `subagent_type: nacl:${name}`;
    });
  }
  return { text: out, count };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

// ---------------------------------------------------------------------------
// FS helpers
// ---------------------------------------------------------------------------

const TEXT_EXT = new Set([".md", ".sh", ".ps1", ".mjs", ".yaml", ".yml", ".json"]);
const SKIP_NAMES = new Set([".DS_Store"]);

function isTextFile(p) {
  return TEXT_EXT.has(path.extname(p));
}

function listFilesSorted(dir) {
  const out = [];
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      if (SKIP_NAMES.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDirRaw(srcDir, dstDir) {
  for (const f of listFilesSorted(srcDir)) {
    const rel = path.relative(srcDir, f);
    copyFile(f, path.join(dstDir, rel));
  }
}

// ---------------------------------------------------------------------------
// Build pipeline
// ---------------------------------------------------------------------------

function loadManifest(root) {
  const p = path.join(root, "scripts", "plugin-manifest.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function stripPrefix(dirName) {
  return dirName.replace(/^nacl-/, "");
}

export function buildPlugin({ root, outDir, manifest }) {
  manifest = manifest ?? loadManifest(root);
  const report = {
    ruleCounts: {},
    warnings: [],
    sourceCommit: null,
  };

  // 1. wipe/recreate outDir
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const rosterDirNames = manifest.include;
  const rosterStripped = rosterDirNames.map(stripPrefix);
  const excludedNames = new Set((manifest.exclude || []).map((e) => e.name));

  const ruleTotals = {
    R1_skill_md_frontmatter_name: 0,
    R2_repo_root_bash: 0,
    R3_repo_root_powershell: 0,
    R4_graph_doctor_path: 0,
    R5_home_skills_leftover_warnings: 0,
    R6_relative_lib_links: 0,
    R7_bare_lib_token_md: 0,
    R7_lib_dirs_templates_refs_md: 0,
    Rgoal_sections: 0,
    Rgoal_standalone_refs: 0,
    R8_install_sidecar_sh: 0,
    R8_install_sidecar_ps1: 0,
    R8_vps_provision_warnings: 0,
    R10_slash_invocations: 0,
    R10_subagent_type: 0,
  };

  // 2. copy each included skill dir -> plugin/skills/<name>/
  for (const dirName of rosterDirNames) {
    const srcDir = path.join(root, dirName);
    const targetName = stripPrefix(dirName);
    const dstDir = path.join(outDir, "skills", targetName);
    for (const f of listFilesSorted(srcDir)) {
      const rel = path.relative(srcDir, f);
      const dst = path.join(dstDir, rel);
      const isSkillMd = rel === "SKILL.md";
      const carrier = isSkillMd ? "substituted" : "other";

      if (!isTextFile(f)) {
        copyFile(f, dst);
        continue;
      }

      let text = fs.readFileSync(f, "utf8");

      if (isSkillMd) {
        const r1 = applyR1(text);
        text = r1.text;
        ruleTotals.R1_skill_md_frontmatter_name += r1.count;
      }

      const r2 = applyR2(text);
      text = r2.text;
      ruleTotals.R2_repo_root_bash += r2.count;

      const r3 = applyR3(text);
      text = r3.text;
      ruleTotals.R3_repo_root_powershell += r3.count;

      const r4 = applyR4(text, carrier);
      text = r4.text;
      ruleTotals.R4_graph_doctor_path += r4.count;

      const r6 = applyR6(text, carrier);
      text = r6.text;
      ruleTotals.R6_relative_lib_links += r6.count;

      if (path.extname(f) === ".md") {
        const r7 = applyR7(text, carrier);
        text = r7.text;
        ruleTotals.R7_bare_lib_token_md += r7.count;

        const rgoal = applyRGoal(text);
        text = rgoal.text;
        ruleTotals.Rgoal_sections += rgoal.sectionCount;
        ruleTotals.Rgoal_standalone_refs += rgoal.standaloneCount;
      }

      const r8 = applyR8(text, carrier);
      text = r8.text;
      if (r8.count > 0) {
        // count sh vs ps1 separately by re-scanning post-hoc counts is awkward;
        // attribute all R8 hits to the .sh bucket (only .sh occurs in this repo)
        // and record ps1 bucket as measured 0 unless detected below.
      }
      ruleTotals.R8_install_sidecar_sh += r8.count;
      if (r8.vpsWarnings > 0) {
        ruleTotals.R8_vps_provision_warnings += r8.vpsWarnings;
        report.warnings.push(`R8: ${rel} in ${dirName} references graph-infra/vps/provision-vps.sh (left as-is)`);
      }

      const r5hits = detectR5(text);
      for (const h of r5hits) {
        ruleTotals.R5_home_skills_leftover_warnings++;
        report.warnings.push(`R5: ${dirName}/${rel} still contains "${h}" (left as-is; requires repo checkout)`);
      }

      const r10 = applyR10Slash(text, rosterStripped);
      text = r10.text;
      ruleTotals.R10_slash_invocations += r10.count;

      const r10b = applyR10SubagentType(text);
      text = r10b.text;
      ruleTotals.R10_subagent_type += r10b.count;

      // warn about slash-invocations of excluded skills left untouched (same
      // token-boundary as R10Slash, so a rewritten path segment like
      // "${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/..." is never mistaken for a
      // "/nacl-core" slash command).
      for (const ex of excludedNames) {
        const re = new RegExp(`(^|[\\s\`"'(|>])\\/${escapeRe(ex)}(?![a-z0-9-])`, "gm");
        const hits = text.match(re) || [];
        if (hits.length > 0) {
          report.warnings.push(`R10: ${dirName}/${rel} references excluded ${ex} ${hits.length}x (left as-is)`);
        }
      }

      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, text, "utf8");
    }
  }

  // 3a. copy agents -> plugin/agents/ (substituted carrier), apply R10 rename too
  const agentsSrc = path.join(root, manifest.agents_dir || ".claude/agents");
  const agentsDst = path.join(outDir, "agents");
  for (const f of listFilesSorted(agentsSrc)) {
    const rel = path.relative(agentsSrc, f);
    const dst = path.join(agentsDst, rel);
    if (!isTextFile(f)) {
      copyFile(f, dst);
      continue;
    }
    let text = fs.readFileSync(f, "utf8");
    const r2 = applyR2(text);
    text = r2.text;
    ruleTotals.R2_repo_root_bash += r2.count;
    const r4 = applyR4(text, "substituted");
    text = r4.text;
    ruleTotals.R4_graph_doctor_path += r4.count;
    const r6 = applyR6(text, "substituted");
    text = r6.text;
    ruleTotals.R6_relative_lib_links += r6.count;
    if (path.extname(f) === ".md") {
      const r7 = applyR7(text, "substituted");
      text = r7.text;
      ruleTotals.R7_bare_lib_token_md += r7.count;
      const rgoal = applyRGoal(text);
      text = rgoal.text;
      ruleTotals.Rgoal_sections += rgoal.sectionCount;
      ruleTotals.Rgoal_standalone_refs += rgoal.standaloneCount;
    }
    const r10 = applyR10Slash(text, rosterStripped);
    text = r10.text;
    ruleTotals.R10_slash_invocations += r10.count;
    // agent "Routes skills: nacl-x, nacl-y" bare names -> nacl:x
    text = text.replace(/\bnacl-([a-z0-9-]+)\b/g, (m, rest) => {
      if (rosterStripped.includes(rest)) {
        ruleTotals.R10_slash_invocations += 0; // counted separately below
        return `nacl:${rest}`;
      }
      return m;
    });
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, text, "utf8");
  }

  // 3b. lib_dirs -> byte-identical copy, except:
  //   - nacl-tl-core/{templates,references}/*.md (project-facing prose: R7 + R-goal)
  //   - nacl-core/SKILL.md (no longer an invocable plugin skill — see manifest.exclude
  //     "nacl-core" — but it stays readable as a doc at plugin/nacl-core/SKILL.md, and
  //     other skills' SKILL.md tell readers to open it there. It is NOT a "substituted"
  //     file (nothing loads it as a skill entry point, so Claude never inlines
  //     ${CLAUDE_PLUGIN_ROOT} into its body), so its own self-references use the
  //     $(nacl-home) carrier, same as any other non-substituted copied file. R1 is
  //     intentionally NOT applied — its frontmatter `name: nacl-core` stays as-is,
  //     since it identifies the library, not a plugin skill entry. The HALT canonical
  //     markers/text are left intact; only the graph-doctor.mjs path inside them (R4)
  //     and bare nacl-core/ self-references (R7) are substituted.
  for (const lib of manifest.lib_dirs) {
    const srcDir = path.join(root, lib);
    const dstDir = path.join(outDir, lib);
    for (const f of listFilesSorted(srcDir)) {
      const rel = path.relative(srcDir, f);
      const dst = path.join(dstDir, rel);
      const isTemplateOrRefTarget =
        lib === "nacl-tl-core" &&
        (rel.startsWith(`templates${path.sep}`) || rel.startsWith(`references${path.sep}`)) &&
        path.extname(f) === ".md";
      const isNaclCoreSkillMd = lib === "nacl-core" && rel === "SKILL.md";
      const isRewriteTarget = isTemplateOrRefTarget || isNaclCoreSkillMd;
      if (!isRewriteTarget) {
        copyFile(f, dst);
        continue;
      }
      let text = fs.readFileSync(f, "utf8");
      if (isNaclCoreSkillMd) {
        const r4 = applyR4(text, "other");
        text = r4.text;
        ruleTotals.R4_graph_doctor_path += r4.count;
      }
      const r7 = applyR7(text, "other");
      text = r7.text;
      ruleTotals.R7_lib_dirs_templates_refs_md += r7.count;
      const rgoal = applyRGoal(text);
      text = rgoal.text;
      ruleTotals.Rgoal_sections += rgoal.sectionCount;
      ruleTotals.Rgoal_standalone_refs += rgoal.standaloneCount;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, text, "utf8");
    }
  }

  // 3c. graph_infra allowlist -> plugin/graph-infra/... (byte-identical)
  const giSrcRoot = path.join(root, "graph-infra");
  const giDstRoot = path.join(outDir, "graph-infra");
  for (const entry of manifest.graph_infra) {
    const src = path.join(giSrcRoot, entry);
    if (entry.endsWith("/")) {
      if (fs.existsSync(src)) copyDirRaw(src, path.join(giDstRoot, entry));
    } else {
      if (fs.existsSync(src)) copyFile(src, path.join(giDstRoot, entry));
    }
  }

  // 5. invariant post-check
  const invariantViolations = checkInvariants(outDir, rosterStripped);

  // 6. generated files
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const version = parseChangelogVersion(changelog);
  let sourceCommit = "unknown";
  try {
    sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    // best-effort only
  }
  report.sourceCommit = sourceCommit;

  const pluginJson = {
    name: manifest.name,
    description: manifest.description,
    version,
    author: { name: "ITSalt" },
  };
  fs.mkdirSync(path.join(outDir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(outDir, ".claude-plugin", "plugin.json"),
    JSON.stringify(pluginJson, null, 2) + "\n",
    "utf8"
  );

  const naclHomeShim = `#!/bin/sh\nCDPATH= cd -P -- "$(dirname -- "$0")/.." && pwd\n`;
  fs.mkdirSync(path.join(outDir, "bin"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "bin", "nacl-home"), naclHomeShim, "utf8");
  fs.chmodSync(path.join(outDir, "bin", "nacl-home"), 0o755);

  const coexistScript = `#!/bin/sh\n# check-coexistence.sh — warn (never fail) if the repo-side symlink install\n# of NaCl skills is also present alongside this plugin install.\n# Intentional dual-channel setups (e.g. framework dogfooding: Desktop via\n# the plugin, CLI via the symlinked skills) opt out with NACL_ALLOW_DUAL=1.\nif [ "\${NACL_ALLOW_DUAL:-}" = "1" ]; then exit 0; fi\nif [ -e "$HOME/.claude/skills/nacl-init" ]; then\n  echo "nacl plugin: detected $HOME/.claude/skills/nacl-init (repo-side symlink install) alongside the nacl plugin — remove the symlinks (see docs/skills-guide.md) to avoid duplicate/conflicting skills, or set NACL_ALLOW_DUAL=1 if the dual setup is intentional."\nfi\nexit 0\n`;
  fs.mkdirSync(path.join(outDir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "scripts", "check-coexistence.sh"), coexistScript, "utf8");
  fs.chmodSync(path.join(outDir, "scripts", "check-coexistence.sh"), 0o755);

  const hooksJson = {
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume",
          hooks: [
            {
              type: "command",
              command: 'node "${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/graph-doctor.mjs" --hook',
              timeout: 10,
            },
            {
              type: "command",
              command: '"${CLAUDE_PLUGIN_ROOT}/scripts/check-coexistence.sh"',
              timeout: 5,
            },
          ],
        },
      ],
    },
  };
  fs.mkdirSync(path.join(outDir, "hooks"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "hooks", "hooks.json"), JSON.stringify(hooksJson, null, 2) + "\n", "utf8");

  const readme = buildReadme({ manifest, version, rosterDirNames });
  fs.writeFileSync(path.join(outDir, "README.md"), readme, "utf8");

  // The committed report must not embed the source commit: the commit that
  // will contain this file cannot be known at build time, so any recorded
  // HEAD makes `--check` drift against a rebuild from the committed tree.
  const buildReport = {
    version,
    ruleCounts: ruleTotals,
    warnings: report.warnings,
    invariantViolations,
  };
  fs.writeFileSync(path.join(outDir, ".build-report.json"), JSON.stringify(buildReport, null, 2) + "\n", "utf8");

  // pin enforcement
  const pinMismatches = [];
  const pins = manifest.rewrite_pins || {};
  for (const [key, expected] of Object.entries(pins)) {
    const actual = ruleTotals[key];
    if (actual !== undefined && actual !== expected) {
      pinMismatches.push({ key, expected, actual });
    }
  }

  if (invariantViolations.length > 0) {
    throw new BuildError("invariant violation", { invariantViolations });
  }
  if (pinMismatches.length > 0) {
    throw new BuildError("rewrite pin mismatch", { pinMismatches });
  }

  return { ruleTotals, warnings: report.warnings, invariantViolations, pinMismatches, version, sourceCommit };
}

export class BuildError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
}

function buildReadme({ manifest, version, rosterDirNames }) {
  const rosterRows = rosterDirNames
    .map((d) => `| \`${d}\` | \`skills/${stripPrefix(d)}\` |`)
    .join("\n");
  const excludeRows = (manifest.exclude || [])
    .map((e) => `| \`${e.name}\` | ${e.reason} |`)
    .join("\n");
  return `<!-- DO NOT EDIT — generated by scripts/build-plugin.mjs. Edit the source skills and re-run the build. -->

# NaCl (Claude Code plugin)

Version ${version}. NaCl's BA/SA/TL spec-graph methodology, packaged as a Claude Code Desktop plugin.

## Install

\`\`\`
/plugin marketplace add ITSalt/NaCl
/plugin install nacl@nacl
\`\`\`

## Do not double-install

Do not install this plugin in a checkout that also has the repo-side symlinked skills
(\`~/.claude/skills/nacl-*\`) active — pick one channel. A SessionStart hook warns if both
are detected.

## Included skills (${rosterDirNames.length})

| Source dir | Plugin skill |
| --- | --- |
${rosterRows}

## Excluded skills

| Source dir | Reason |
| --- | --- |
${excludeRows}

## Neo4j MCP server

The project graph's MCP server is configured per-project (via \`/nacl:init\`), not by this
plugin — the plugin ships the skills, not project infrastructure.
`;
}

function checkInvariants(outDir, rosterStripped) {
  const violations = [];
  // ../nacl-core and ../nacl-tl-core relative-link leftovers: checked across
  // the whole rewritten surface (skills/ + agents/) — lib_dirs and graph_infra
  // are intentionally byte-identical copies of the framework and are out of
  // scope (a "../nacl-core" string there refers to the framework repo layout
  // itself, not a plugin-resolvable path).
  const rewrittenRoots = ["skills", "agents"];
  const rewrittenTemplateRefs = [
    path.join("nacl-tl-core", "templates"),
    path.join("nacl-tl-core", "references"),
  ];
  const rewrittenLibFiles = [path.join("nacl-core", "SKILL.md")];
  const inScope = (rel) =>
    rewrittenRoots.some((r) => rel.startsWith(r + path.sep)) ||
    rewrittenTemplateRefs.some((r) => rel.startsWith(r + path.sep)) ||
    rewrittenLibFiles.includes(rel);

  // nacl-core must never be an invocable plugin skill.
  if (fs.existsSync(path.join(outDir, "skills", "core"))) {
    violations.push("skills/core: must not exist — nacl-core is a library, not a plugin skill");
  }

  for (const f of listFilesSorted(outDir)) {
    if (!isTextFile(f)) continue;
    const rel = path.relative(outDir, f);
    if (!inScope(rel)) continue;
    const text = fs.readFileSync(f, "utf8");
    if (/\.\.\/nacl-core\//.test(text) || /\.\.\/nacl-tl-core\//.test(text)) {
      violations.push(`${rel}: leftover ../nacl-core or ../nacl-tl-core reference`);
    }
    if (path.extname(f) === ".md") {
      const bareRe = /(^|[^A-Za-z0-9_/.$}-])(nacl-core\/|nacl-tl-core\/)/;
      if (bareRe.test(text)) {
        violations.push(`${rel}: leftover bare nacl-core/ or nacl-tl-core/ token`);
      }
    }
    // /nacl-<x> slash-invocation leftovers only checked in skills/ + agents/
    // (the primary substituted/nacl-home surface); templates/references are
    // prose examples not meant to receive R10.
    if (rewrittenRoots.some((r) => rel.startsWith(r + path.sep))) {
      for (const name of rosterStripped) {
        const re = new RegExp(`(^|[\\s\`"'(|>])\\/nacl-${escapeRe(name)}(?![a-z0-9-])`);
        if (re.test(text)) {
          violations.push(`${rel}: leftover /nacl-${name} slash invocation`);
        }
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// --check mode: build to a temp dir and byte-compare with committed plugin/
// ---------------------------------------------------------------------------

function compareDirs(a, b) {
  const filesA = listFilesSorted(a).map((f) => path.relative(a, f));
  const filesB = listFilesSorted(b).map((f) => path.relative(b, f));
  const setA = new Set(filesA);
  const setB = new Set(filesB);
  const diffs = [];
  for (const f of filesA) {
    if (!setB.has(f)) diffs.push(`only in built output: ${f}`);
  }
  for (const f of filesB) {
    if (!setA.has(f)) diffs.push(`only in committed plugin/: ${f}`);
  }
  for (const f of filesA) {
    if (!setB.has(f)) continue;
    const ba = fs.readFileSync(path.join(a, f));
    const bb = fs.readFileSync(path.join(b, f));
    if (!ba.equals(bb)) diffs.push(`content differs: ${f}`);
  }
  return diffs.sort();
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes("--check");
  let root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const rootIdx = args.indexOf("--root");
  if (rootIdx !== -1) root = path.resolve(args[rootIdx + 1]);

  if (checkMode) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nacl-plugin-check-"));
    try {
      buildPlugin({ root, outDir: tmp });
      const committed = path.join(root, "plugin");
      if (!fs.existsSync(committed)) {
        console.error("plugin/ does not exist in the repo — nothing to compare against.");
        process.exit(1);
      }
      const diffs = compareDirs(tmp, committed);
      if (diffs.length > 0) {
        console.error(`build drift detected: ${diffs.length} differing path(s):`);
        for (const d of diffs.slice(0, 20)) console.error(`  ${d}`);
        process.exit(1);
      }
      console.log("plugin/ is up to date with scripts/build-plugin.mjs output.");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    return;
  }

  const outDir = path.join(root, "plugin");
  try {
    const result = buildPlugin({ root, outDir });
    console.log(`Built plugin/ (version ${result.version}, commit ${result.sourceCommit}).`);
    console.log(`Rule hit counts: ${JSON.stringify(result.ruleTotals, null, 2)}`);
    if (result.warnings.length > 0) {
      console.log(`Warnings (${result.warnings.length}):`);
      for (const w of result.warnings) console.log(`  - ${w}`);
    }
  } catch (err) {
    if (err instanceof BuildError) {
      console.error(`Build failed: ${err.message}`);
      console.error(JSON.stringify(err.details, null, 2));
      process.exit(1);
    }
    throw err;
  }
}

if (process.argv[1] === __filename) {
  main();
}
