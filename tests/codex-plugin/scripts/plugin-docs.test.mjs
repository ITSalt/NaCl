import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const checker = path.join(repoRoot, "scripts", "check-plugin-docs.mjs");
const corePairs = [
  ["README.md", "README.ru.md"],
  ["docs/quickstart.md", "docs/quickstart.ru.md"],
  ["docs/setup/install-codex-plugin.md", "docs/setup/install-codex-plugin.ru.md"],
  ["docs/codex-plugin.md", "docs/codex-plugin.ru.md"],
  ["docs/setup/codex-legacy-compatibility.md", "docs/setup/codex-legacy-compatibility.ru.md"],
];

const supportPairs = [
  ["docs/architecture.md", "docs/architecture.ru.md"],
  ["docs/setup/install-skills.md", "docs/setup/install-skills.ru.md"],
  ["docs/setup/install-macos.md", "docs/setup/install-macos.ru.md"],
  ["docs/setup/install-linux.md", "docs/setup/install-linux.ru.md"],
  ["docs/setup/install-windows.md", "docs/setup/install-windows.ru.md"],
  ["docs/setup/graph-setup.md", "docs/setup/graph-setup.ru.md"],
  ["docs/workflows.md", "docs/workflows.ru.md"],
  ["docs/skills-guide.md", "docs/skills-guide.ru.md"],
  ["docs/skills-reference.md", "docs/skills-reference.ru.md"],
  ["docs/configuration.md", "docs/configuration.ru.md"],
  ["docs/runbooks/provision-shared-graph-vps.md", "docs/runbooks/provision-shared-graph-vps.ru.md"],
  ["docs/runbooks/connect-to-existing-remote-project.md", "docs/runbooks/connect-to-existing-remote-project.ru.md"],
  ["plugins/nacl/resources/docs/runbooks/provision-shared-graph-vps.md", "plugins/nacl/resources/docs/runbooks/provision-shared-graph-vps.ru.md"],
  ["plugins/nacl/resources/docs/runbooks/connect-to-existing-remote-project.md", "plugins/nacl/resources/docs/runbooks/connect-to-existing-remote-project.ru.md"],
];

const supportSingles = [
  "docs/runbooks/upgrade-graph-extensions.md",
  "plugins/nacl/resources/docs/runbooks/upgrade-graph-extensions.md",
];

function numberedNames(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, "0")}`);
}

function definitionModule(exportName, prefix, count) {
  const definitions = numberedNames(prefix, count).map((name) => ({ name }));
  return `export const ${exportName} = ${JSON.stringify(definitions, null, 2)};\n`;
}

async function put(root, relative, content) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
  return filename;
}

function documentContent(relative, russian = false, { core = false, inventoryNames = [] } = {}) {
  const isLegacy = relative.includes("codex-legacy-compatibility");
  const link = relative === "README.md" || relative === "README.ru.md"
    ? russian
      ? "\n[Целевой раздел](docs/target.md#target-section)\n"
      : "\n[Target section](docs/target.md#target-section)\n"
    : relative === "docs/architecture.md" || relative === "docs/architecture.ru.md"
      ? "\n[Target section](target.md#target-section)\n"
    : "\n";
  const legacy = isLegacy
    ? "\nLegacy examples: `git clone`, `skills-for-codex`, `.agents/skills`, `install-user-symlinks.sh`, and `@anthropic/neo4j-mcp`.\n"
    : "";
  const inventory = inventoryNames.length > 0 ? `\n${inventoryNames.map((name) => `\`${name}\``).join("\n")}\n` : "";
  const provisionContract = relative.endsWith("provision-shared-graph-vps.md") || relative.endsWith("provision-shared-graph-vps.ru.md")
    ? [
        "server-wide registered gateways",
        "```sh",
        "sh <NaCl>/graph-infra/vps/issue-client-cert.sh dev@example.com --server-id graph.example.com",
        "sh <NaCl>/graph-infra/vps/revoke-client-cert.sh dev@example.com --server-id graph.example.com",
        "```",
      ].join("\n")
    : "";
  const connectContract = relative.endsWith("connect-to-existing-remote-project.md") || relative.endsWith("connect-to-existing-remote-project.ru.md")
    ? "graph.remote.secret_source env:NEO4J_PASSWORD server-route:<id> .mcp.json opaque непрозрачная"
    : "";
  return [
    russian ? "# Документ" : "# Document",
    "",
    core ? "<!-- doc-key: primary -->" : "",
    russian ? "## Основной путь" : "## Primary path",
    link,
    legacy,
    inventory,
    provisionContract,
    connectContract,
  ].join("\n");
}

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-plugin-docs-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const publicSkills = numberedNames("nacl-public", 10);
  const workflows = numberedNames("nacl-workflow", 60);
  const inventoryNames = [...publicSkills, ...workflows];

  for (const [english, russian] of corePairs) {
    await put(root, english, documentContent(english, false, { core: true }));
    await put(root, russian, documentContent(russian, true, { core: true }));
  }
  for (const [english, russian] of supportPairs) {
    const names = english === "docs/skills-reference.md" ? inventoryNames : [];
    await put(root, english, documentContent(english, false, { inventoryNames: names }));
    await put(root, russian, documentContent(russian, true, { inventoryNames: names }));
  }
  for (const relative of supportSingles) {
    await put(root, relative, documentContent(relative));
  }
  await put(root, "docs/target.md", "# Target section\n");

  for (const name of publicSkills) {
    await put(root, `plugins/nacl/skills/${name}/SKILL.md`, `# ${name}\n`);
  }
  for (const name of workflows) {
    await put(root, `plugins/nacl/resources/workflows/${name}/SKILL.md`, `# ${name}\n`);
  }
  await put(
    root,
    "plugins/nacl/resources/package-index.json",
    `${JSON.stringify({ schemaVersion: 1, publicEntrySkills: publicSkills, internalWorkflows: workflows }, null, 2)}\n`,
  );
  await put(
    root,
    "plugins/nacl/runtime/graph-gateway/project-tools.mjs",
    definitionModule("PROJECT_TOOL_DEFINITIONS", "nacl_project_fixture", 3),
  );
  await put(
    root,
    "plugins/nacl/runtime/workflow-cli/workflow-tools.mjs",
    definitionModule("WORKFLOW_TOOL_DEFINITIONS", "nacl_workflow_tool_fixture", 7),
  );
  await put(
    root,
    "plugins/nacl/runtime/graph-gateway/tool-schemas.mjs",
    definitionModule("GRAPH_TOOL_DEFINITIONS", "nacl_graph_fixture", 14),
  );
  await put(
    root,
    "plugins/nacl/scripts/nacl-package-mcp.mjs",
    'const DOCTOR_TOOL_NAME = "nacl_installation_doctor";\n',
  );
  return root;
}

function runCheck(root) {
  const result = spawnSync(process.execPath, [checker, "--repo-root", root], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { ...result, combined: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

test("verifies all Wave 8 links, translation parity, the legacy allowlist, and generated source inventories", async (t) => {
  const root = await createFixture(t);
  const result = runCheck(root);

  assert.equal(result.status, 0, result.combined);
  assert.match(result.stdout, /Status: VERIFIED/);
  assert.match(result.stdout, /Wave 8 Markdown files: 40/);
  assert.match(result.stdout, /Public skills \(10\):/);
  assert.match(result.stdout, /Internal workflows \(60\):/);
  assert.match(result.stdout, /MCP tools \(25\):/);
});

test("rejects broken repo-local links and GitHub-style anchors in support documents", async (t) => {
  const root = await createFixture(t);
  const english = path.join(root, "docs", "architecture.md");
  const russian = path.join(root, "docs", "architecture.ru.md");
  await writeFile(english, (await readFile(english, "utf8")).replace("target.md", "missing.md"));
  await writeFile(russian, (await readFile(russian, "utf8")).replace("#target-section", "#missing-section"));

  const result = runCheck(root);
  assert.equal(result.status, 1, result.combined);
  assert.match(result.stderr, /broken Markdown link: docs\/architecture\.md -> missing\.md#target-section/);
  assert.match(result.stderr, /broken GitHub-style anchor: docs\/architecture\.ru\.md -> target\.md#missing-section/);
});

test("rejects RU/EN semantic key parity drift", async (t) => {
  const root = await createFixture(t);
  const russian = path.join(root, "docs", "quickstart.ru.md");
  await writeFile(russian, (await readFile(russian, "utf8")).replace("doc-key: primary", "doc-key: changed"));

  const result = runCheck(root);
  assert.equal(result.status, 1, result.combined);
  assert.match(result.stderr, /RU\/EN semantic doc-key order differs: docs\/quickstart\.md/);
});

test("rejects RU/EN heading hierarchy drift in a support pair", async (t) => {
  const root = await createFixture(t);
  const russian = path.join(root, "docs", "configuration.ru.md");
  await writeFile(russian, (await readFile(russian, "utf8")).replace("## Основной", "### Основной"));

  const result = runCheck(root);
  assert.equal(result.status, 1, result.combined);
  assert.match(result.stderr, /RU\/EN heading hierarchy differs: docs\/configuration\.md/);
});

test("rejects legacy installation patterns on a plugin-first page", async (t) => {
  const root = await createFixture(t);
  const readme = path.join(root, "README.md");
  await writeFile(readme, `${await readFile(readme, "utf8")}\nRun git clone before Install.\n`);

  const result = runCheck(root);
  assert.equal(result.status, 1, result.combined);
  assert.match(result.stderr, /forbidden plugin-first pattern git clone: README\.md/);
});

test("rejects lowercase plaintext graph-password assignments in support documentation", async (t) => {
  const root = await createFixture(t);
  const configuration = path.join(root, "docs", "configuration.md");
  await writeFile(configuration, `${await readFile(configuration, "utf8")}\nneo4j_password: changeme\n`);

  const result = runCheck(root);
  assert.equal(result.status, 1, result.combined);
  assert.match(result.stderr, /forbidden documentation pattern plaintext neo4j_password assignment/);
});

test("rejects MCP source-registry inventory drift", async (t) => {
  const root = await createFixture(t);
  await put(
    root,
    "plugins/nacl/runtime/graph-gateway/tool-schemas.mjs",
    definitionModule("GRAPH_TOOL_DEFINITIONS", "nacl_graph_fixture", 13),
  );

  const result = runCheck(root);
  assert.equal(result.status, 1, result.combined);
  assert.match(result.stderr, /accepted plugin inventory drift: MCP tools expected 25, found 24/);
});

test("rejects drift between a root runbook and its bundled documentation mirror", async (t) => {
  const root = await createFixture(t);
  const bundled = path.join(root, "plugins", "nacl", "resources", "docs", "runbooks", "upgrade-graph-extensions.md");
  await writeFile(bundled, `${await readFile(bundled, "utf8")}\nBundled drift.\n`);

  const result = runCheck(root);
  assert.equal(result.status, 1, result.combined);
  assert.match(
    result.stderr,
    /bundled documentation mirror differs: docs\/runbooks\/upgrade-graph-extensions\.md <> plugins\/nacl\/resources\/docs\/runbooks\/upgrade-graph-extensions\.md/,
  );
});

test("rejects legacy project-scoped issue/revoke commands and revoke without server-id", async (t) => {
  const root = await createFixture(t);
  const provision = path.join(root, "docs", "runbooks", "provision-shared-graph-vps.md");
  await writeFile(
    provision,
    `${await readFile(provision, "utf8")}\n\`\`\`sh\nsh graph-infra/vps/issue-client-cert.sh dev@example.com --scope project-a --prefix project-a\nsh graph-infra/vps/revoke-client-cert.sh dev@example.com --scope project-a --prefix project-a\n\`\`\`\n`,
  );

  const result = runCheck(root);
  assert.equal(result.status, 1, result.combined);
  assert.match(result.stderr, /certificate command requires --server-id: docs\/runbooks\/provision-shared-graph-vps\.md -> issue-client-cert\.sh/);
  assert.match(result.stderr, /legacy project-scoped certificate command is forbidden: docs\/runbooks\/provision-shared-graph-vps\.md -> issue-client-cert\.sh/);
  assert.match(result.stderr, /certificate command requires --server-id: docs\/runbooks\/provision-shared-graph-vps\.md -> revoke-client-cert\.sh/);
  assert.match(result.stderr, /legacy project-scoped certificate command is forbidden: docs\/runbooks\/provision-shared-graph-vps\.md -> revoke-client-cert\.sh/);
});

test("rejects a remote connect runbook without graph.remote.secret_source", async (t) => {
  const root = await createFixture(t);
  const connect = path.join(root, "docs", "runbooks", "connect-to-existing-remote-project.md");
  await writeFile(connect, (await readFile(connect, "utf8")).replace("graph.remote.secret_source", "graph.remote.route_reference"));

  const result = runCheck(root);
  assert.equal(result.status, 1, result.combined);
  assert.match(result.stderr, /mandatory remote secret contract token is missing: docs\/runbooks\/connect-to-existing-remote-project\.md -> graph\.remote\.secret_source/);
});

test("rejects a skills reference that omits an internal workflow from the generated inventory", async (t) => {
  const root = await createFixture(t);
  const russian = path.join(root, "docs", "skills-reference.ru.md");
  await writeFile(russian, (await readFile(russian, "utf8")).replace("nacl-workflow-60", "omitted-workflow"));

  const result = runCheck(root);
  assert.equal(result.status, 1, result.combined);
  assert.match(result.stderr, /docs\/skills-reference\.ru\.md is missing internal workflow name: nacl-workflow-60/);
});
