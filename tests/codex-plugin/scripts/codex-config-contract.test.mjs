import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { parse: parseToml } = require("../../../codex-plugin-src/package/resources/bootstrap/vendor/smol-toml-1.7.0.cjs");
const modules = [
  await import("../../../codex-plugin-src/package/resources/bootstrap/codex-config-contract.mjs"),
  await import("../../../plugins/nacl/resources/bootstrap/codex-config-contract.mjs"),
];

const options = {
  node: "/usr/bin/node",
  launcher: "/opt/nacl/launch.mjs",
  binary: "/opt/nacl/nacl-mcp.mjs",
  uri: "bolt://127.0.0.1:7687",
  database: "neo4j",
};

for (const [copyIndex, contract] of modules.entries()) {
  const expected = contract.renderManagedBlock(options);
  const targetTable = `[mcp_servers.${contract.SERVER_ID}]`;

  test(`codex config TOML contract copy ${copyIndex + 1}: established General 8-case baseline`, () => {
    const cases = [
      ["empty", "", "merge-safe"],
      ["exact managed block", expected, "reusable"],
      ["unrelated TOML around block", `model = "x"\n\n${expected}\n[features]\nf = true\n`, "reusable"],
      ["START only", `${contract.START_MARKER}\n`, "blocked", "CODEX_MCP_SECTION_AMBIGUOUS"],
      ["END only", `${contract.END_MARKER}\n`, "blocked", "CODEX_MCP_SECTION_AMBIGUOUS"],
      ["D1 whole block in literal data", `payload = '''\n${expected}'''\n`, "merge-safe"],
      ["D2 target table line in literal data", `payload = '''\n${targetTable}\n'''\n`, "merge-safe"],
      ["D3 literal target line before real block", `payload = '''\n${targetTable}\n'''\n${expected}`, "reusable"],
    ];

    for (const [name, source, state, code] of cases) {
      assert.doesNotThrow(() => parseToml(source), `${name} fixture must be valid TOML`);
      const result = contract.inspectCodexConfig(source, expected);
      assert.equal(result.state, state, name);
      if (code) assert.equal(result.code, code, name);
    }
  });

  test(`codex config TOML contract copy ${copyIndex + 1}: strings and comments are not syntax`, () => {
    const decoyBlock = `${contract.START_MARKER}\n${targetTable}\n${contract.END_MARKER}`;
    const source = [
      `# decoy marker text ${contract.START_MARKER}`,
      `# ${targetTable}`,
      `# mcp_servers.nacl_neo4j = { command = "comment decoy" }`,
      `# [mcp_servers]`,
      `# nacl_neo4j = { command = "comment decoy" }`,
      `single_basic = ${JSON.stringify(decoyBlock)}`,
      `single_literal = '${contract.START_MARKER} ${targetTable} ${contract.END_MARKER}'`,
      `multi_basic = """`,
      `${String.fromCharCode(92)}"""`,
      decoyBlock,
      `mcp_servers.nacl_neo4j = { command = "decoy" }`,
      `[mcp_servers]`,
      `nacl_neo4j = { command = "decoy" }`,
      `""""`,
      `multi_literal = '''`,
      decoyBlock,
      `mcp_servers.nacl_neo4j = { command = 'decoy' }`,
      `[mcp_servers]`,
      `nacl_neo4j = { command = 'decoy' }`,
      `'''''`,
      "",
    ].join("\n");

    assert.doesNotThrow(() => parseToml(source));
    assert.equal(contract.inspectCodexConfig(source, expected).state, "merge-safe");
  });

  test(`codex config TOML contract copy ${copyIndex + 1}: multiline 4/5-quote closings preserve marker offsets`, () => {
    const fourQuoteClose = `data = """\n${contract.START_MARKER}\n${targetTable}\n${contract.END_MARKER}\n""""\n`;
    const fiveQuoteClose = `more = '''\n${contract.START_MARKER}\n${targetTable}\n${contract.END_MARKER}\n'''''\n`;
    assert.doesNotThrow(() => parseToml(`${fourQuoteClose}${expected}`));
    assert.doesNotThrow(() => parseToml(`${fiveQuoteClose}${expected}`));
    assert.equal(contract.inspectCodexConfig(`${fourQuoteClose}${expected}`, expected).state, "reusable");
    assert.equal(contract.inspectCodexConfig(`${fiveQuoteClose}${expected}`, expected).state, "reusable");
  });

  test(`codex config TOML contract copy ${copyIndex + 1}: real target forms remain blocked`, () => {
    const conflicts = [
      `${targetTable}\ncommand = "/usr/bin/other"\n`,
      `mcp_servers.nacl_neo4j = { command = "/usr/bin/other" }\n`,
      `[mcp_servers]\nnacl_neo4j = { command = "/usr/bin/other" }\n`,
      `mcp_servers = { nacl_neo4j = { command = "/usr/bin/other" } }\n`,
      `['mcp_servers'.'nacl_neo4j']\ncommand = "/usr/bin/other"\n`,
      `"mcp_servers"."nacl_neo4j" = { command = "/usr/bin/other" }\n`,
      `["mcp_servers"]\n'nacl_neo4j' = { command = "/usr/bin/other" }\n`,
    ];
    for (const source of conflicts) {
      const result = contract.inspectCodexConfig(source, expected);
      assert.equal(result.state, "blocked", source);
      assert.equal(result.code, "CODEX_MCP_SECTION_AMBIGUOUS", source);
    }
  });

  test(`codex config TOML contract copy ${copyIndex + 1}: real conflicts, duplicate and unpaired markers fail closed`, () => {
    const changed = expected.replace(`command = ${JSON.stringify(options.node)}`, `command = "/usr/bin/other"`);
    const duplicate = `${expected}\n${expected}`;
    for (const [name, source, code] of [
      ["conflicting managed bytes", changed, "CODEX_MCP_CONFIG_CONFLICT"],
      ["valid block bytes with a structurally changed target", `${expected}extra_target_key = true\n`, "CODEX_MCP_CONFIG_CONFLICT"],
      ["duplicate target block", duplicate, undefined],
      ["unpaired start", `${contract.START_MARKER}\n${expected}`, "CODEX_MCP_SECTION_AMBIGUOUS"],
      ["malformed table syntax", "[mcp_servers\n", "CODEX_CONFIG_MALFORMED"],
    ]) {
      const result = contract.inspectCodexConfig(source, expected);
      assert.equal(result.state, "blocked", name);
      if (code) assert.equal(result.code, code, name);
    }
  });
}
