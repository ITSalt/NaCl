#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { openSync, closeSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONTRACT, LOCK_FILENAME, agentsContents, buildPlan, configContents } from "./plan-project-creation.mjs";

function emit(value, stream = process.stdout) { stream.write(`${JSON.stringify(value, null, 2)}\n`); }
function fail(code, details = {}, status = "BLOCKED") { emit({ contract: CONTRACT, operation: "project-creation-apply", status, code, ...details }, status === "VERIFIED" ? process.stdout : process.stderr); process.exit(status === "VERIFIED" ? 0 : 1); }

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--") || index + 1 >= argv.length) fail("ARGUMENT_INVALID", {}, "FAILED");
    const key = item.slice(2);
    if (!new Set(["project-root", "project-name", "project-description", "tech-stack", "plan-hash", "confirmation"]).has(key) || values[key] !== undefined) fail("ARGUMENT_INVALID", {}, "FAILED");
    values[key] = argv[++index];
  }
  return values;
}

function argumentsForPlan(values) {
  const result = ["--project-root", values["project-root"] ?? "", "--project-name", values["project-name"] ?? ""];
  if (values["project-description"] !== undefined) result.push("--project-description", values["project-description"]);
  if (values["tech-stack"] !== undefined) result.push("--tech-stack", values["tech-stack"]);
  return result;
}

function writeNew(filename, content) {
  let descriptor;
  try { descriptor = openSync(filename, "wx", 0o644); writeFileSync(descriptor, content, "utf8"); } catch (error) { if (error?.code === "EEXIST") fail("PROJECT_CREATION_PLAN_STALE", { path: filename }); throw error; } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function git(root, args) {
  try { execFileSync("git", args, { cwd: root, stdio: "pipe", timeout: 10_000 }); } catch (error) { fail("PROJECT_GIT_OPERATION_FAILED", { projectRoot: root, detail: String(error?.stderr ?? "git command failed").slice(0, 512) }, "PARTIALLY_VERIFIED"); }
}

const values = parse(process.argv.slice(2));
let lockPath;
const created = [];
try {
  const plan = buildPlan(argumentsForPlan(values));
  if (values["plan-hash"] !== plan.planHash) fail("PROJECT_CREATION_PLAN_STALE", { projectRoot: plan.projectRoot });
  if (values.confirmation !== plan.confirmation) fail("CONFIRMATION_REQUIRED", { projectRoot: plan.projectRoot, requiredConfirmation: plan.confirmation });
  lockPath = path.join(plan.projectRoot, LOCK_FILENAME);
  try { const descriptor = openSync(lockPath, "wx", 0o600); closeSync(descriptor); } catch (error) { if (error?.code === "EEXIST") fail("PROJECT_CREATION_BUSY", { projectRoot: plan.projectRoot }); throw error; }
  const lockedPlan = buildPlan(argumentsForPlan(values));
  if (lockedPlan.planHash !== plan.planHash) fail("PROJECT_CREATION_PLAN_STALE", { projectRoot: plan.projectRoot });
  const input = { projectName: plan.projectName, projectDescription: plan.projectDescription, techStack: plan.techStack };
  writeNew(plan.config.path, configContents({ projectId: plan.projectId, ...input }));
  created.push("config.yaml");
  if (plan.agents.action === "create") { writeNew(plan.agents.path, agentsContents(input)); created.push("AGENTS.md"); }
  if (plan.gitAction === "initialize-and-commit") git(plan.projectRoot, ["init", "-q"]);
  if (plan.gitAction !== "preserve-history") { git(plan.projectRoot, ["add", "--", "config.yaml", ...(plan.agents.action === "create" ? ["AGENTS.md"] : [])]); git(plan.projectRoot, ["commit", "--quiet", "-m", "Initialize NaCl project"]); }
  emit({ contract: CONTRACT, operation: "project-creation-apply", status: "VERIFIED", code: "PROJECT_CREATED", projectRoot: plan.projectRoot, projectId: plan.projectId, created, agentsAction: plan.agents.action, gitAction: plan.gitAction });
} catch (error) {
  fail("PROJECT_CREATION_PARTIAL", created.length > 0 ? { created, recovery: "Inspect the listed files before retrying." } : {}, created.length > 0 ? "PARTIALLY_VERIFIED" : "FAILED");
} finally {
  if (lockPath) rmSync(lockPath, { force: true });
}
