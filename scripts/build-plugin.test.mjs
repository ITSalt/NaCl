import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  parseChangelogVersion,
  applyR1,
  applyR2,
  applyR3,
  applyR4,
  applyR6,
  applyR7,
  applyRGoal,
  applyR8,
  applyR10Slash,
  applyR10SubagentType,
  detectR5,
  buildPlugin,
  BuildError,
} from "./build-plugin.mjs";

const __filename = fileURLToPath(import.meta.url);
const SCRIPT = path.join(path.dirname(__filename), "build-plugin.mjs");

describe("parseChangelogVersion", () => {
  test("parses the newest ## [X.Y.Z] heading", () => {
    const text = "# Changelog\n\n## [2.23.0] — 2026-06-29\n\nbody\n\n## [2.22.0] — 2026-06-13\n";
    assert.equal(parseChangelogVersion(text), "2.23.0");
  });

  test("throws when no version heading is present", () => {
    assert.throws(() => parseChangelogVersion("# Changelog\n\nno versions here\n"));
  });
});

describe("R1 — SKILL.md frontmatter name", () => {
  test("rewrites name: nacl-<x> in the first frontmatter block only", () => {
    const fixture = [
      "---",
      "name: nacl-ba-context",
      "description: foo",
      "---",
      "",
      "Body text mentions `name: nacl-something` but not as frontmatter.",
    ].join("\n");
    const { text, count } = applyR1(fixture);
    assert.equal(count, 1);
    assert.match(text, /^name: ba-context$/m);
    assert.match(text, /Body text mentions `name: nacl-something`/);
  });

  test("no-op when there is no frontmatter", () => {
    const { text, count } = applyR1("just a body\n");
    assert.equal(count, 0);
    assert.equal(text, "just a body\n");
  });
});

describe("R2/R3 — exact-block REPO_ROOT resolution", () => {
  test("R2 replaces the exact bash line, counts occurrences", () => {
    const line = 'REPO_ROOT="$(cd -P "$HOME/.claude/skills/nacl-init" 2>/dev/null && cd .. && pwd)"';
    const fixture = `${line}\necho hi\n${line}\n`;
    const { text, count } = applyR2(fixture);
    assert.equal(count, 2);
    assert.ok(!text.includes(line));
    assert.match(text, /REPO_ROOT="\$\{CLAUDE_PLUGIN_ROOT\}"/);
  });

  test("R3 replaces the exact PowerShell block with a single line", () => {
    const fixture = [
      "before",
      '$link   = Join-Path $env:USERPROFILE ".claude\\skills\\nacl-init"',
      "$target = (Get-Item $link).Target | Select-Object -First 1",
      "if (-not $target) { $target = (Get-Item $link).FullName }",
      "$RepoRoot = Split-Path $target -Parent",
      "after",
    ].join("\n");
    const { text, count } = applyR3(fixture);
    assert.equal(count, 1);
    assert.equal(text, 'before\n$RepoRoot = "${CLAUDE_PLUGIN_ROOT}"\nafter');
  });
});

describe("R4 — graph-doctor.mjs path, carrier-aware", () => {
  const needle = "$HOME/.claude/skills/nacl-core/scripts/graph-doctor.mjs";

  test("substituted carrier uses ${CLAUDE_PLUGIN_ROOT}", () => {
    const { text, count } = applyR4(`run ${needle} now`, "substituted");
    assert.equal(count, 1);
    assert.equal(text, "run ${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/graph-doctor.mjs now");
  });

  test("other carrier uses $(nacl-home)", () => {
    const { text, count } = applyR4(`run ${needle} now`, "other");
    assert.equal(count, 1);
    assert.equal(text, "run $(nacl-home)/nacl-core/scripts/graph-doctor.mjs now");
  });
});

describe("R7 — token-boundary bare lib-dir references", () => {
  test("rewrites a backtick-fenced bare reference", () => {
    const fixture = "Run `nacl-core/scripts/nacl-ids.mjs` now.";
    const { text, count } = applyR7(fixture, "substituted");
    assert.equal(count, 1);
    assert.equal(text, "Run `${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/nacl-ids.mjs` now.");
  });

  test("does NOT rewrite when preceded by a path/variable character", () => {
    const fixture = '"$REPO_ROOT/nacl-tl-core/x"';
    const { text, count } = applyR7(fixture, "substituted");
    assert.equal(count, 0);
    assert.equal(text, fixture);
  });

  test("does NOT rewrite an already-substituted ${CLAUDE_PLUGIN_ROOT}/nacl-core/ occurrence", () => {
    const fixture = "${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/x.mjs";
    const { text, count } = applyR7(fixture, "substituted");
    assert.equal(count, 0);
    assert.equal(text, fixture);
  });

  test("rewrites at start-of-string / start-of-line", () => {
    const fixture = "nacl-tl-core/references/tdd-workflow.md describes this.";
    const { text, count } = applyR7(fixture, "other");
    assert.equal(count, 1);
    assert.equal(text, "$(nacl-home)/nacl-tl-core/references/tdd-workflow.md describes this.");
  });
});

describe("R-goal — section excision", () => {
  test("removes a ## section (with nested ### content) up to the next ## heading", () => {
    const fixture = [
      "# Title",
      "",
      "## Use with /goal",
      "",
      "Some prose.",
      "",
      "### Nested detail",
      "",
      "More nested prose that must also be removed.",
      "",
      "## Next section",
      "",
      "Kept.",
    ].join("\n");
    const { text, sectionCount } = applyRGoal(fixture);
    assert.equal(sectionCount, 1);
    assert.ok(!text.includes("Use with /goal"));
    assert.ok(!text.includes("Nested detail"));
    assert.ok(!text.includes("Some prose."));
    assert.ok(text.includes("## Next section"));
    assert.ok(text.includes("Kept."));
  });

  test("stops at a same-or-higher-level heading, not a deeper one", () => {
    const fixture = ["## Use with /goal", "### still inside", "## After"].join("\n");
    const { text } = applyRGoal(fixture);
    assert.ok(!text.includes("still inside"));
    assert.ok(text.includes("## After"));
  });

  test("removes standalone nacl-goal/checks/ lines outside of removed sections", () => {
    const fixture = ["kept line", "see nacl-goal/checks/foo.sh for details", "also kept"].join("\n");
    const { text, standaloneCount } = applyRGoal(fixture);
    assert.equal(standaloneCount, 1);
    assert.ok(!text.includes("nacl-goal/checks/"));
    assert.ok(text.includes("kept line"));
    assert.ok(text.includes("also kept"));
  });
});

describe("R8 — graph-infra framework-copy allowlist", () => {
  test("rewrites install-sidecar.sh reference (substituted carrier)", () => {
    const { text, count } = applyR8("run graph-infra/scripts/install-sidecar.sh --start", "substituted");
    assert.equal(count, 1);
    assert.equal(text, "run ${CLAUDE_PLUGIN_ROOT}/graph-infra/scripts/install-sidecar.sh --start");
  });

  test("leaves project-relative graph-infra/ references untouched", () => {
    const fixture = "See graph-infra/docker-compose.yml and graph-infra/boards/ for the project copy.";
    const { text, count } = applyR8(fixture, "substituted");
    assert.equal(count, 0);
    assert.equal(text, fixture);
  });

  test("flags graph-infra/vps/provision-vps.sh as a warning without rewriting it", () => {
    const fixture = "provisioned via graph-infra/vps/provision-vps.sh";
    const { text, vpsWarnings } = applyR8(fixture, "substituted");
    assert.equal(vpsWarnings, 1);
    assert.equal(text, fixture);
  });
});

describe("R10 — slash invocation rewriting", () => {
  const roster = ["ba", "ba-from-board", "tl-dev", "tl-dev-be"];

  test("longest-roster-name-first: /nacl-ba-from-board is a whole-token match, not /nacl-ba", () => {
    const { text, count } = applyR10Slash("Run /nacl-ba-from-board now.", roster);
    assert.equal(count, 1);
    assert.equal(text, "Run /nacl:ba-from-board now.");
  });

  test("does not half-match: /nacl-ba stays /nacl-ba when ba-from-board is also in roster", () => {
    const { text, count } = applyR10Slash("Run /nacl-ba now.", roster);
    assert.equal(count, 1);
    assert.equal(text, "Run /nacl:ba now.");
  });

  test("leaves references to excluded (non-roster) names untouched", () => {
    const { text, count } = applyR10Slash("Run /nacl-goal conduct.", roster);
    assert.equal(count, 0);
    assert.equal(text, "Run /nacl-goal conduct.");
  });

  test("respects token boundaries (does not match a longer unrelated name)", () => {
    const { text, count } = applyR10Slash("Run /nacl-tl-dev-be-extra now.", ["tl-dev-be"]);
    assert.equal(count, 0);
    assert.equal(text, "Run /nacl-tl-dev-be-extra now.");
  });

  test("subagent_type rewriting", () => {
    const { text, count } = applyR10SubagentType('subagent_type: developer and subagent_type: "developer"');
    assert.equal(count, 2);
    assert.ok(text.includes("subagent_type: nacl:developer"));
    assert.ok(text.includes('subagent_type: "nacl:developer"'));
  });
});

describe("detectR5 — leftover $HOME/.claude/skills/ references", () => {
  test("detects a leftover reference", () => {
    const hits = detectR5('node "$(cd -P "$HOME/.claude/skills/yougile-setup" 2>/dev/null && pwd)/dist/index.js"');
    assert.equal(hits.length, 1);
    assert.equal(hits[0], "$HOME/.claude/skills/yougile-setup");
  });

  test("no hits on clean text", () => {
    assert.deepEqual(detectR5("nothing here"), []);
  });
});

describe("R6 — relative markdown-link lib references", () => {
  test("rewrites (../nacl-core/ and (../nacl-tl-core/", () => {
    const fixture = "See [x](../nacl-core/lang-directive.md) and [y](../nacl-tl-core/references/foo.md).";
    const { text, count } = applyR6(fixture, "substituted");
    assert.equal(count, 2);
    assert.equal(
      text,
      "See [x](${CLAUDE_PLUGIN_ROOT}/nacl-core/lang-directive.md) and [y](${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/foo.md)."
    );
  });
});

// ---------------------------------------------------------------------------
// End-to-end: synthetic mini-repo, --root override
// ---------------------------------------------------------------------------

function makeMiniRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nacl-plugin-fixture-"));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, ".claude", "agents"), { recursive: true });
  fs.mkdirSync(path.join(root, "nacl-core", "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "nacl-tl-core", "templates"), { recursive: true });
  fs.mkdirSync(path.join(root, "nacl-tl-core", "references"), { recursive: true });
  fs.mkdirSync(path.join(root, "graph-infra", "schema"), { recursive: true });
  fs.mkdirSync(path.join(root, "nacl-fake-one"), { recursive: true });
  fs.mkdirSync(path.join(root, "nacl-fake-two"), { recursive: true });
  fs.mkdirSync(path.join(root, "nacl-excluded-thing"), { recursive: true });

  fs.writeFileSync(
    path.join(root, "CHANGELOG.md"),
    "# Changelog\n\n## [0.1.0] — 2026-01-01\n\nInitial.\n"
  );

  fs.writeFileSync(
    path.join(root, "nacl-fake-one", "SKILL.md"),
    [
      "---",
      "name: nacl-fake-one",
      "description: fixture skill one",
      "---",
      "",
      "Invoke /nacl-fake-two for details.",
      "",
      "Reads `nacl-core/scripts/helper.mjs` and $HOME/.claude/skills/nacl-core/scripts/graph-doctor.mjs.",
      "",
      "## Use with /goal",
      "",
      "This whole section must be removed for the plugin.",
      "",
      "## Kept section",
      "",
      "Stays.",
      "",
      "Excluded ref: /nacl-excluded-thing should stay untouched.",
    ].join("\n")
  );
  fs.mkdirSync(path.join(root, "nacl-fake-one", "checks"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "nacl-fake-one", "checks", "verify.sh"),
    "#!/bin/sh\necho nacl-core/scripts/helper.mjs\n"
  );

  fs.writeFileSync(
    path.join(root, "nacl-fake-two", "SKILL.md"),
    ["---", "name: nacl-fake-two", "description: fixture skill two", "---", "", "Body."].join("\n")
  );

  fs.writeFileSync(
    path.join(root, "nacl-excluded-thing", "SKILL.md"),
    ["---", "name: nacl-excluded-thing", "description: excluded fixture", "---", "", "Body."].join("\n")
  );

  fs.writeFileSync(path.join(root, "nacl-core", "SKILL.md"), ["---", "name: nacl-core", "description: lib", "---", "", "Lib body."].join("\n"));
  fs.writeFileSync(path.join(root, "nacl-core", "scripts", "helper.mjs"), "export const x = 1;\n");
  fs.writeFileSync(
    path.join(root, "nacl-tl-core", "templates", "t.md"),
    "See nacl-core/scripts/helper.mjs.\n\n## Use with /goal\n\nremoved\n\n## Kept\n\nstays\n"
  );
  fs.writeFileSync(path.join(root, "nacl-tl-core", "references", "r.md"), "Plain reference doc.\n");

  fs.writeFileSync(
    path.join(root, ".claude", "agents", "fixture-agent.md"),
    ["---", "name: fixture-agent", "---", "", "Routes skills: nacl-fake-one, nacl-fake-two."].join("\n")
  );

  fs.writeFileSync(path.join(root, "graph-infra", "docker-compose.yml"), "version: '3'\n");
  fs.writeFileSync(path.join(root, "graph-infra", "schema", "s.cypher"), "// schema\n");
  fs.mkdirSync(path.join(root, "graph-infra", "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "graph-infra", "scripts", "install-sidecar.sh"), "#!/bin/sh\necho hi\n");
  fs.writeFileSync(path.join(root, "graph-infra", "scripts", "install-sidecar.ps1"), "Write-Host hi\n");

  const manifest = {
    name: "nacl",
    description: "fixture",
    include: ["nacl-fake-one", "nacl-fake-two"],
    exclude: [{ name: "nacl-excluded-thing", reason: "fixture exclusion" }],
    lib_dirs: ["nacl-core", "nacl-tl-core"],
    graph_infra: ["docker-compose.yml", "schema/", "scripts/install-sidecar.sh", "scripts/install-sidecar.ps1"],
    agents_dir: ".claude/agents",
    rewrite_pins: {
      R1_skill_md_frontmatter_name: 2,
      R7_bare_lib_token_md: 1,
      Rgoal_sections: 2,
    },
  };
  fs.writeFileSync(path.join(root, "scripts", "plugin-manifest.json"), JSON.stringify(manifest, null, 2));
  return root;
}

describe("end-to-end: synthetic mini-repo build", () => {
  test("builds a plugin/ tree with the expected shape and rewrites", () => {
    const root = makeMiniRepo();
    const outDir = path.join(root, "plugin");
    const result = buildPlugin({ root, outDir });

    assert.equal(result.pinMismatches.length, 0);
    assert.equal(result.invariantViolations.length, 0);

    const skillMd = fs.readFileSync(path.join(outDir, "skills", "fake-one", "SKILL.md"), "utf8");
    assert.match(skillMd, /^name: fake-one$/m);
    assert.ok(skillMd.includes("/nacl:fake-two"));
    assert.ok(!skillMd.includes("## Use with /goal"));
    assert.ok(skillMd.includes("## Kept section"));
    assert.ok(skillMd.includes("${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/helper.mjs"));
    assert.ok(skillMd.includes("${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/graph-doctor.mjs"));
    assert.ok(skillMd.includes("/nacl-excluded-thing"));

    const checkSh = fs.readFileSync(path.join(outDir, "skills", "fake-one", "checks", "verify.sh"), "utf8");
    assert.ok(checkSh.includes("nacl-core/scripts/helper.mjs")); // R7 restricted to .md only

    const agent = fs.readFileSync(path.join(outDir, "agents", "fixture-agent.md"), "utf8");
    assert.ok(agent.includes("nacl:fake-one"));
    assert.ok(agent.includes("nacl:fake-two"));

    const libSkillMd = fs.readFileSync(path.join(outDir, "nacl-core", "SKILL.md"), "utf8");
    assert.ok(libSkillMd.includes("name: nacl-core")); // byte-identical, not rewritten

    const template = fs.readFileSync(path.join(outDir, "nacl-tl-core", "templates", "t.md"), "utf8");
    assert.ok(template.includes("$(nacl-home)/nacl-core/scripts/helper.mjs"));
    assert.ok(!template.includes("## Use with /goal"));

    assert.ok(fs.existsSync(path.join(outDir, ".claude-plugin", "plugin.json")));
    const pluginJson = JSON.parse(fs.readFileSync(path.join(outDir, ".claude-plugin", "plugin.json"), "utf8"));
    assert.equal(pluginJson.version, "0.1.0");
    assert.ok(fs.existsSync(path.join(outDir, "bin", "nacl-home")));
    assert.ok(fs.existsSync(path.join(outDir, "hooks", "hooks.json")));
    assert.ok(fs.existsSync(path.join(outDir, "graph-infra", "docker-compose.yml")));
    assert.ok(fs.existsSync(path.join(outDir, "graph-infra", "scripts", "install-sidecar.sh")));

    fs.rmSync(root, { recursive: true, force: true });
  });

  test("pin mismatch raises BuildError", () => {
    const root = makeMiniRepo();
    const manifestPath = path.join(root, "scripts", "plugin-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.rewrite_pins.R1_skill_md_frontmatter_name = 99;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    assert.throws(
      () => buildPlugin({ root, outDir: path.join(root, "plugin") }),
      (err) => err instanceof BuildError && err.message === "rewrite pin mismatch"
    );

    fs.rmSync(root, { recursive: true, force: true });
  });

  test("determinism: two builds of the same source produce byte-identical trees", () => {
    const root = makeMiniRepo();
    const outA = path.join(root, "plugin-a");
    const outB = path.join(root, "plugin-b");
    buildPlugin({ root, outDir: outA });
    buildPlugin({ root, outDir: outB });

    function walk(dir, base = dir) {
      const out = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p, base));
        else out.push(path.relative(base, p));
      }
      return out;
    }
    const filesA = walk(outA);
    const filesB = walk(outB);
    assert.deepEqual(filesA, filesB);
    for (const f of filesA) {
      const a = fs.readFileSync(path.join(outA, f));
      const b = fs.readFileSync(path.join(outB, f));
      assert.ok(a.equals(b), `content differs for ${f}`);
    }

    fs.rmSync(root, { recursive: true, force: true });
  });

  test("CLI --root builds successfully against the fixture repo", () => {
    const root = makeMiniRepo();
    execFileSync("node", [SCRIPT, "--root", root], { encoding: "utf8" });
    assert.ok(fs.existsSync(path.join(root, "plugin", ".claude-plugin", "plugin.json")));
    fs.rmSync(root, { recursive: true, force: true });
  });

  test("CLI --check --root passes against a freshly-built fixture, fails after drift", () => {
    const root = makeMiniRepo();
    execFileSync("node", [SCRIPT, "--root", root], { encoding: "utf8" });
    // passes when nothing has changed
    execFileSync("node", [SCRIPT, "--check", "--root", root], { encoding: "utf8" });

    // introduce drift directly in the committed output
    fs.writeFileSync(path.join(root, "plugin", "skills", "fake-one", "SKILL.md"), "drift\n");
    assert.throws(() => execFileSync("node", [SCRIPT, "--check", "--root", root], { encoding: "utf8" }));

    fs.rmSync(root, { recursive: true, force: true });
  });
});
