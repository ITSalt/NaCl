#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(serviceRoot, "../..");
const bundleRoot = path.join(serviceRoot, "dist/nacl-public-mcp-bundle");
const archive = path.join(serviceRoot, "dist/nacl-public-mcp-bundle.tar");
const baseDigest = "sha256:09e2b3d9726018aecf269bd35325f46bf75046a643a66d28360ec71132750ec8";
const image = `nacl-public-mcp-smoke:${process.pid}-${Date.now()}`;
const invalidSourceImage = `${image}-invalid-source`;
const invalidArchiveImage = `${image}-invalid-archive`;
const container = `nacl-public-mcp-smoke-${process.pid}-${Date.now()}`;
const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-public-mcp-container-"));

function docker(args, { timeout = 180_000 } = {}) {
  return spawnSync("docker", args, { cwd: repoRoot, encoding: "utf8", timeout });
}

function requireSuccess(result, action) {
  if (result.status !== 0) throw new Error(`${action} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

const config = {
  resourceUrl: "https://mcp.example.test/mcp",
  resourceMetadataUrl: "https://mcp.example.test/.well-known/oauth-protected-resource",
  authorizationServers: ["https://identity.example.test/"],
  scopesSupported: ["nacl.server.read", "nacl.server.write", "nacl.server.schema", "nacl.server.backup", "nacl.server.restore"],
  trustedIssuers: ["https://identity.example.test/"],
  allowedOrigins: ["https://chatgpt.com"],
  serverVersion: "0.1.0-container-smoke",
  listen: { host: "0.0.0.0", port: 8080 },
};

const adapter = `
const graphAdapter = Object.fromEntries([
  "projectSummary", "namedRead", "mutateProject", "applySchema", "createBackup", "requestRestore",
].map((name) => [name, async () => { throw new Error(name + " is unavailable in structural smoke"); }]));
export async function createDeploymentAdapters() {
  return {
    async resolveVerifiedToken() { throw new Error("no token is accepted by structural smoke"); },
    controlPlane: {
      sessionRegistryDurability: "durable",
      authorizationStateDurability: "durable",
      authorizationStateScope: "shared",
      async authorize() { throw new Error("not used"); },
      async listProjects() { throw new Error("not used"); },
    },
    graphAdapter,
    auditSink: { durability: "durable", newSupportRef() { return "support_00000000000000000000000000000000"; }, async record() {} },
    rateLimiter: { scope: "shared", async assert() {} },
    idempotencyLedger: { durability: "durable", async execute() { throw new Error("not used"); } },
  };
}
`;

try {
  requireSuccess(docker(["version", "--format", "{{.Server.Version}}"]), "Docker daemon check");
  const baseId = requireSuccess(docker(["image", "inspect", `node@${baseDigest}`, "--format", "{{.Id}}"]), "pinned Node image inspection");
  if (baseId !== baseDigest) throw new Error(`pinned Node image identity mismatch: ${baseId}`);

  requireSuccess(spawnSync(process.execPath, [path.join(serviceRoot, "scripts/build-bundle.mjs")], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60_000,
  }), "deterministic bundle build");
  const manifest = JSON.parse(await readFile(path.join(bundleRoot, "bundle-manifest.json"), "utf8"));
  const archiveDigest = createHash("sha256").update(await readFile(archive)).digest("hex");
  const revision = requireSuccess(spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }), "VCS revision lookup");
  for (const [label, tag, sourceDigest, candidateArchiveDigest] of [
    ["source", invalidSourceImage, "not-a-source-digest", archiveDigest],
    ["archive", invalidArchiveImage, manifest.sourceDigest, "not-an-archive-digest"],
  ]) {
    const rejected = docker([
      "build", "--pull=false",
      "--file", path.join(bundleRoot, "services/nacl-mcp/Containerfile"),
      "--build-arg", `SOURCE_DIGEST=${sourceDigest}`,
      "--build-arg", `ARCHIVE_DIGEST=${candidateArchiveDigest}`,
      "--build-arg", `VCS_REVISION=${revision}`,
      "--tag", tag,
      bundleRoot,
    ], { timeout: 300_000 });
    if (rejected.status === 0) throw new Error(`container build accepted an invalid ${label} digest`);
    if (docker(["image", "inspect", tag]).status === 0) throw new Error(`invalid ${label} build left an image`);
  }
  requireSuccess(docker([
    "build", "--pull=false",
    "--file", path.join(bundleRoot, "services/nacl-mcp/Containerfile"),
    "--build-arg", `SOURCE_DIGEST=${manifest.sourceDigest}`,
    "--build-arg", `ARCHIVE_DIGEST=${archiveDigest}`,
    "--build-arg", `VCS_REVISION=${revision}`,
    "--tag", image,
    bundleRoot,
  ], { timeout: 300_000 }), "rootless container build");

  const labels = JSON.parse(requireSuccess(docker(["image", "inspect", image, "--format", "{{json .Config.Labels}}"]), "container label inspection"));
  if (labels["org.opencontainers.image.source-digest"] !== manifest.sourceDigest || labels["org.opencontainers.image.archive-digest"] !== archiveDigest ||
      labels["org.opencontainers.image.revision"] !== revision) {
    throw new Error("container labels are not bound to the deterministic source and archive digests");
  }
  const configuredUser = requireSuccess(docker(["image", "inspect", image, "--format", "{{.Config.User}}"]), "container user inspection");
  if (configuredUser !== "node") throw new Error(`container is not rootless: ${configuredUser}`);

  const configPath = path.join(temporary, "config.json");
  const adapterPath = path.join(temporary, "adapter.mjs");
  await writeFile(configPath, `${JSON.stringify(config)}\n`, { mode: 0o600 });
  await writeFile(adapterPath, adapter, { mode: 0o600 });
  await chmod(temporary, 0o755);
  await chmod(configPath, 0o644);
  await chmod(adapterPath, 0o644);
  requireSuccess(docker([
    "run", "--detach", "--name", container,
    "--label", "nacl.test.kind=public-mcp-container-smoke",
    "--network", "none",
    "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--mount", `type=bind,src=${temporary},dst=/deployment,readonly`,
    "--env", "NACL_MCP_CONFIG_FILE=/deployment/config.json",
    "--env", "NACL_MCP_ADAPTER_MODULE=/deployment/adapter.mjs",
    image,
  ]), "rootless container start");

  let health = "starting";
  for (let attempt = 0; attempt < 60 && health === "starting"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    health = requireSuccess(docker(["container", "inspect", container, "--format", "{{.State.Health.Status}}"]), "container health inspection");
  }
  if (health !== "healthy") {
    const logs = docker(["logs", container]);
    throw new Error(`container did not become healthy (${health}): ${(logs.stderr || logs.stdout).trim()}`);
  }
  const nodeVersion = requireSuccess(docker(["exec", container, "node", "--version"]), "container Node version check");
  if (nodeVersion !== "v20.20.0") throw new Error(`unexpected container Node runtime: ${nodeVersion}`);
  process.stdout.write(`Container smoke VERIFIED: ${nodeVersion}, source ${manifest.sourceDigest}, archive ${archiveDigest}.\n`);
} finally {
  docker(["container", "rm", "--force", container]);
  docker(["image", "rm", "--force", image]);
  docker(["image", "rm", "--force", invalidSourceImage]);
  docker(["image", "rm", "--force", invalidArchiveImage]);
  await rm(temporary, { recursive: true, force: true });
}
