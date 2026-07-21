#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

export const CONTRACT = "nacl-project-bootstrap-v1";
export const LOCK_FILENAME = ".nacl-project-bootstrap.lock";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function emit(value, stream = process.stdout) {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}

function stop(code, details = {}, status = "BLOCKED") {
  emit({ contract: CONTRACT, operation: "project-creation-plan", status, code, ...details }, status === "VERIFIED" ? process.stdout : process.stderr);
  process.exit(status === "VERIFIED" ? 0 : 1);
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--") || index + 1 >= argv.length) stop("ARGUMENT_INVALID", {}, "FAILED");
    const key = argument.slice(2);
    if (!new Set(["project-root", "project-name", "project-description", "tech-stack"]).has(key) || result[key] !== undefined) stop("ARGUMENT_INVALID", {}, "FAILED");
    result[key] = argv[++index];
  }
  return result;
}

function text(value, key, required = false) {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 4096 || /[\0\r\n]/.test(value)) stop("PROJECT_CREATION_INPUT_INVALID", { field: key }, "FAILED");
  return value.trim();
}

function canonicalRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || /[\0\r\n]/.test(value)) stop("PROJECT_ROOT_INVALID", {}, "FAILED");
  let root;
  try {
    root = realpathSync(value);
    if (!statSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error("unsafe root");
  } catch {
    stop("PROJECT_ROOT_UNAVAILABLE", {}, "BLOCKED");
  }
  return root;
}

function inspectFile(root, name) {
  const filename = path.join(root, name);
  try {
    const metadata = lstatSync(filename);
    if (metadata.isSymbolicLink()) return { exists: true, safe: false, path: name };
    if (!metadata.isFile()) return { exists: true, safe: false, path: name };
    return { exists: true, safe: true, path: name, sha256: sha256(readFileSync(filename)) };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, safe: true, path: name };
    stop("PROJECT_CREATION_STATE_UNAVAILABLE", { path: name });
  }
}

function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 }).trim();
  } catch {
    return null;
  }
}

function gitState(root) {
  const repository = git(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
  if (!repository) return { repository: false, history: false, worktree: false, identity: git(root, ["var", "GIT_AUTHOR_IDENT"]) !== null, action: "initialize-and-commit" };
  const history = git(root, ["rev-parse", "--verify", "HEAD"]) !== null;
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  const common = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const worktree = Boolean(top && common && path.resolve(common) !== path.join(path.resolve(top), ".git"));
  return { repository: true, history, worktree, identity: history || git(root, ["var", "GIT_AUTHOR_IDENT"]) !== null, action: history ? "preserve-history" : "commit-init-artifacts" };
}

function projectId(root, name) {
  const bytes = Buffer.from(sha256(`nacl-project-bootstrap-v1\0${root}\0${name}`), "hex").subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function configContents({ projectId: id, projectName, projectDescription, techStack }) {
  const lines = ["# NaCl project configuration.", "project:", `  id: ${JSON.stringify(id)}`, `  name: ${JSON.stringify(projectName)}`];
  if (projectDescription) lines.push(`  description: ${JSON.stringify(projectDescription)}`);
  if (techStack) lines.push(`  stack: ${JSON.stringify(techStack)}`);
  lines.push("", "# Configure graph infrastructure only after project creation.", "graph:", "  mode: \"local\"", "");
  return lines.join("\n");
}

export function agentsContents({ projectName, projectDescription, techStack }) {
  const summary = [projectDescription, techStack ? `Stack: ${techStack}.` : ""].filter(Boolean).join(" ");
  return [
    "# AGENTS.md", "", "## Project context", "", `- Project: ${projectName}.`, ...(summary ? [`- ${summary}`] : []),
    "- Treat `config.yaml` as the project configuration source of truth.", "", "## Working agreements", "",
    "- Inspect relevant code and existing instructions before editing.", "- Keep changes scoped; preserve unrelated user changes.", "- Never place credentials, tokens, or private keys in tracked files.", "- Record only verified build, test, and lint commands here as the project evolves.", "",
    "## Verification", "", "- Run the smallest relevant checks after a change and report what was actually run.", "- Do not claim completion without evidence; state the remaining gap clearly.", "",
    "## Maintaining this file", "", "- Keep this file concise and repository-specific.", "- Add durable rules after recurring mistakes or review feedback.", "- Put directory-specific rules in a closer nested `AGENTS.md` instead of growing this file indefinitely.", "",
  ].join("\n");
}

export function buildPlan(argv = process.argv.slice(2)) {
  const raw = parseArguments(argv);
  const root = canonicalRoot(raw["project-root"]);
  const input = {
    projectName: text(raw["project-name"], "project-name", true),
    projectDescription: raw["project-description"] === undefined ? "" : text(raw["project-description"], "project-description"),
    techStack: raw["tech-stack"] === undefined ? "" : text(raw["tech-stack"], "tech-stack"),
  };
  const config = inspectFile(root, "config.yaml");
  const agents = inspectFile(root, "AGENTS.md");
  if (!config.safe || !agents.safe) stop("PROJECT_CREATION_STATE_UNSAFE", { projectRoot: root });
  if (config.exists) stop("PROJECT_CONFIG_ALREADY_EXISTS", { projectRoot: root, nextAction: "inspect-existing-project" });
  const visibleEntries = readdirSync(root, { withFileTypes: true }).filter((entry) => ![".git", LOCK_FILENAME].includes(entry.name)).map((entry) => entry.name).sort();
  const gitInfo = gitState(root);
  if (gitInfo.worktree) stop("PROJECT_CREATION_WORKTREE", { projectRoot: root });
  if (!gitInfo.repository && visibleEntries.length > 0) stop("PROJECT_ROOT_NOT_EMPTY", { projectRoot: root, visibleEntries });
  if (!gitInfo.identity) stop("GIT_IDENTITY_REQUIRED", { projectRoot: root });
  const id = projectId(root, input.projectName);
  const payload = { projectRoot: root, projectId: id, ...input, config, agents, visibleEntries, git: gitInfo };
  const planHash = sha256(canonicalJson(payload));
  return {
    contract: CONTRACT, operation: "project-creation-plan", status: "VERIFIED", code: "PROJECT_CREATION_PLAN_READY",
    projectRoot: root, projectId: id, projectName: input.projectName, projectDescription: input.projectDescription, techStack: input.techStack, gitAction: gitInfo.action,
    config: { action: "create", path: path.join(root, "config.yaml"), sha256: sha256(configContents({ projectId: id, ...input })) },
    agents: agents.exists ? { action: "preserve", path: path.join(root, "AGENTS.md"), sha256: agents.sha256 } : { action: "create", path: path.join(root, "AGENTS.md"), sha256: sha256(agentsContents(input)) },
    planHash, confirmation: `CREATE_NACL_PROJECT:${planHash}`,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { emit(buildPlan()); } catch (error) { stop("PROJECT_CREATION_PLAN_FAILED", {}, "FAILED"); }
}
