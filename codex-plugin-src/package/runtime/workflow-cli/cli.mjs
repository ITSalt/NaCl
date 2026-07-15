#!/usr/bin/env node
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyAgentProfiles, planAgentProfiles, validateAgentProfileTemplates } from "./agent-profiles.mjs";

function parse(argv) {
  const [command, ...tokens] = argv;
  if (!command || command === "--help" || command === "-h") return { help: true };
  if (command !== "init") throw new Error("unsupported command");
  const values = {};
  let install = false;
  let apply = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const flag = tokens[index];
    if (flag === "--install-agent-profiles") {
      install = true;
      continue;
    }
    if (flag === "--apply") {
      apply = true;
      continue;
    }
    if (!["--project-root", "--plan-token", "--confirmation"].includes(flag)) {
      throw new Error("unsupported option");
    }
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) throw new Error("missing value");
    values[flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  if (!install || typeof values.projectRoot !== "string") throw new Error("missing required option");
  return { command, apply, values };
}

function usage() {
  return [
    "Usage:",
    "  node ./runtime/workflow-cli/cli.mjs init --install-agent-profiles --project-root <absolute-root>",
    "  node ./runtime/workflow-cli/cli.mjs init --install-agent-profiles --project-root <absolute-root> --apply --plan-token <sha256> --confirmation <exact-token>",
    "Planning is read-only. Apply creates absent profiles and never overwrites a differing file.",
    "Move or back up a conflicting file yourself, then run a fresh plan.",
  ].join("\n");
}

export async function runWorkflowCli(options = {}) {
  const write = options.write ?? ((value) => process.stdout.write(value));
  let parsed;
  try {
    parsed = parse(options.argv ?? process.argv.slice(2));
  } catch {
    const output = { contract: "nacl-agent-profiles-v1", operation: "install-agent-profiles", status: "FAILED", code: "CLI_ARGUMENT_INVALID" };
    write(`${JSON.stringify(output)}\n`);
    return { result: output, exitCode: 1 };
  }
  if (parsed.help) {
    write(`${usage()}\n`);
    return { result: null, exitCode: 0 };
  }
  const call = parsed.apply ? applyAgentProfiles : planAgentProfiles;
  const output = await call({
    projectRoot: parsed.values.projectRoot,
    planToken: parsed.values.planToken,
    confirmation: parsed.values.confirmation,
    ...(options.templateRoot ? { templateRoot: options.templateRoot } : {}),
  });
  write(`${JSON.stringify(output)}\n`);
  return { result: output, exitCode: output.status === "VERIFIED" ? 0 : output.status === "BLOCKED" ? 2 : 1 };
}

let isEntrypoint = false;
try {
  isEntrypoint = Boolean(process.argv[1]) && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  isEntrypoint = false;
}
if (isEntrypoint) {
  const outcome = await runWorkflowCli();
  process.exitCode = outcome.exitCode;
}

export { validateAgentProfileTemplates };
