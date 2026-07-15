#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

function blocked(reason) {
  return {
    contract: "nacl-codex-installation-fallback-v1",
    mode: "catalog-unavailable",
    status: "BLOCKED",
    reason,
    guidance:
      "Cannot prove that the nacl plugin is absent. Repair Codex plugin listing or the installation doctor before running a legacy workflow.",
  };
}
export function classifyPluginCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.installed)) return blocked("invalid-catalog-shape");
  const matches = catalog.installed.filter((candidate) => {
    const pluginId = typeof candidate?.pluginId === "string" ? candidate.pluginId : "";
    return pluginId === "nacl" || pluginId.startsWith("nacl@");
  });
  if (matches.some((candidate) => candidate.enabled === true)) {
    return {
      contract: "nacl-codex-installation-fallback-v1",
      mode: "plugin-active-doctor-unavailable",
      status: "FAILED",
      reason: "enabled-plugin-without-doctor",
      guidance:
        "The nacl plugin is installed and enabled but its doctor is unavailable. Disable or remove the plugin, or repair its MCP runtime, then start a new task.",
    };
  }
  if (matches.length > 0) {
    return {
      contract: "nacl-codex-installation-fallback-v1",
      mode: "plugin-artifact-doctor-unavailable",
      status: "BLOCKED",
      reason: "plugin-present-but-not-enabled",
      guidance:
        "A nacl plugin installation is still present while its doctor is unavailable. Remove it to prove legacy-only mode, or repair and enable it, then start a new task.",
    };
  }
  return {
    contract: "nacl-codex-installation-fallback-v1",
    mode: "legacy-only",
    status: "VERIFIED",
    reason: "plugin-proven-absent",
    guidance: "No nacl plugin appears in the current Codex plugin catalog; legacy mode may continue.",
  };
}

export function inspectCurrentCatalog() {
  const result = spawnSync("codex", ["plugin", "list", "--json"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (result.error?.code === "ENOENT") return blocked("codex-cli-unavailable");
  if (result.error || result.status !== 0) return blocked("codex-plugin-list-failed");
  try {
    return classifyPluginCatalog(JSON.parse(result.stdout));
  } catch {
    return blocked("invalid-catalog-json");
  }
}

function mainInvocation() {
  const argument = process.argv[1];
  if (!argument) return { isMain: false, reason: null };
  try {
    return {
      isMain: realpathSync(fileURLToPath(import.meta.url)) === realpathSync(argument),
      reason: null,
    };
  } catch {
    const basename = argument.split(/[\\/]/).at(-1);
    return {
      isMain: basename === "nacl-installation-fallback.mjs",
      reason: basename === "nacl-installation-fallback.mjs" ? "entrypoint-unresolvable" : null,
    };
  }
}

const invocation = mainInvocation();
if (invocation.isMain) {
  const result = invocation.reason ? blocked(invocation.reason) : inspectCurrentCatalog();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "FAILED") process.exitCode = 1;
  if (result.status === "BLOCKED") process.exitCode = 2;
}
