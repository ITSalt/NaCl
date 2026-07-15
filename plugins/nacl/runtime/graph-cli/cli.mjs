#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalGraphLifecycle } from "./lifecycle.mjs";
import { STATUS_EXIT_CODES, lifecycleResult } from "./contracts.mjs";
import { DEFAULT_STATE_ROOT } from "./instance-store.mjs";
import { createProjectRouter } from "./project-registry.mjs";
import { createProjectToolGateway } from "../graph-gateway/project-tools.mjs";

const VALUE_FLAGS = new Set([
  "--project-id",
  "--project-root",
  "--presented-project-id",
  "--confirmation",
  "--state-root",
  "--http-port",
  "--bolt-port",
  "--secret-reference",
  "--backup-dir",
  "--snapshot-file",
  "--manifest",
]);
const REJECTED_FLAGS = /(?:password|passwd|secret-value|token|authorization|neo4j-auth)/i;

function usage() {
  return [
    "Usage: node ./runtime/graph-cli/cli.mjs <command> --project-id <stable-id> --project-root <path> [options]",
    "Commands: project-resolve, project-migrate-id, project-register-root, init, resolve, start, health, stop, doctor, backup, restore-verify",
    "Options:",
    "  --state-root <external-directory>",
    "  --project-root <repository-directory>",
    "  --presented-project-id <generated-uuid> --confirmation <exact-confirmation>",
    "  --http-port <loopback-port> --bolt-port <loopback-port>",
    "  --secret-reference <opaque-reference>   init only; never a secret value",
    "  --backup-dir <external-directory> --snapshot-file <gateway-evidence.json>",
    "  --manifest <backup-manifest.json>       restore-verify",
    "Secret values are deliberately unsupported on the command line.",
  ].join("\n");
}

function parse(argv) {
  const [command, ...tokens] = argv;
  if (!command || command === "--help" || command === "-h") return { help: true };
  const values = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const flag = tokens[index];
    if (REJECTED_FLAGS.test(flag)) throw new Error("Secret-bearing command-line flags are forbidden.");
    if (!VALUE_FLAGS.has(flag)) throw new Error(`Unsupported option: ${flag}`);
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    values[flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  for (const field of ["httpPort", "boltPort"]) {
    if (values[field] !== undefined) values[field] = Number(values[field]);
  }
  return { command, values };
}

export async function runCli(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const write = options.write ?? ((value) => process.stdout.write(value));
  let parsed;
  try {
    parsed = parse(argv);
  } catch {
    const result = lifecycleResult("cli", "FAILED", "CLI_ARGUMENT_INVALID");
    write(`${JSON.stringify(result)}\n`);
    return { result, exitCode: STATUS_EXIT_CODES[result.status] };
  }
  if (parsed.help) {
    write(`${usage()}\n`);
    return { result: null, exitCode: 0 };
  }

  if (
    parsed.values.projectRoot !== undefined &&
    !path.isAbsolute(parsed.values.projectRoot)
  ) {
    const result = lifecycleResult("cli", "FAILED", "PROJECT_ROOT_INVALID");
    write(`${JSON.stringify(result)}\n`);
    return { result, exitCode: STATUS_EXIT_CODES[result.status] };
  }

  const stateRoot = parsed.values.stateRoot ?? options.lifecycleOptions?.stateRoot ?? DEFAULT_STATE_ROOT;
  const projectRouter = options.projectRouter ?? createProjectRouter({
    registryRoot: path.join(path.resolve(stateRoot), ".project-registry"),
    ...(options.projectRouterOptions ?? {}),
  });
  const projectTools = createProjectToolGateway({ router: projectRouter });
  const lifecycle = createLocalGraphLifecycle({
    ...(options.lifecycleOptions ?? {}),
    stateRoot,
    projectRouter,
  });
  const common = {
    projectId: parsed.values.projectId,
    projectRoot: parsed.values.projectRoot === undefined ? undefined : path.resolve(parsed.values.projectRoot),
  };
  let result;
  switch (parsed.command) {
    case "project-resolve":
      result = await projectTools.callTool("nacl_project_resolve", {
        ...(parsed.values.projectRoot === undefined ? {} : { project_root: path.resolve(parsed.values.projectRoot) }),
      });
      break;
    case "project-migrate-id":
      result = await projectTools.callTool("nacl_project_migrate_identity", {
        project_root: parsed.values.projectRoot === undefined ? undefined : path.resolve(parsed.values.projectRoot),
        presented_project_id: parsed.values.presentedProjectId,
        confirmation: parsed.values.confirmation,
      });
      break;
    case "project-register-root":
      result = await projectTools.callTool("nacl_project_register_root", {
        project_id: parsed.values.projectId,
        project_root: parsed.values.projectRoot === undefined ? undefined : path.resolve(parsed.values.projectRoot),
        confirmation: parsed.values.confirmation,
      });
      break;
    case "init":
      result = await lifecycle.init({
        ...common,
        httpPort: parsed.values.httpPort,
        boltPort: parsed.values.boltPort,
        secretReference: parsed.values.secretReference,
      });
      break;
    case "resolve":
      result = await lifecycle.resolve(common);
      break;
    case "start":
      result = await lifecycle.start(common);
      break;
    case "health":
      result = await lifecycle.health(common);
      break;
    case "stop":
      result = await lifecycle.stop(common);
      break;
    case "doctor":
      result = await lifecycle.doctor(common);
      break;
    case "backup": {
      let snapshot;
      try {
        snapshot = JSON.parse(await readFile(parsed.values.snapshotFile, "utf8"));
      } catch {
        result = lifecycleResult("backup", "BLOCKED", "BACKUP_EVIDENCE_INVALID", common);
        break;
      }
      result = await lifecycle.backup({
        ...common,
        backupDir: parsed.values.backupDir,
        snapshot,
      });
      break;
    }
    case "restore-verify":
      result = await lifecycle.restoreVerify({
        ...common,
        manifestPath: parsed.values.manifest,
        httpPort: parsed.values.httpPort,
        boltPort: parsed.values.boltPort,
      });
      break;
    default:
      result = lifecycleResult("cli", "FAILED", "CLI_COMMAND_INVALID");
  }
  write(`${JSON.stringify(result)}\n`);
  return { result, exitCode: STATUS_EXIT_CODES[result.status] };
}

let isEntrypoint = false;
try {
  isEntrypoint =
    Boolean(process.argv[1]) &&
    realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  isEntrypoint = false;
}
if (isEntrypoint) {
  const outcome = await runCli();
  process.exitCode = outcome.exitCode;
}
