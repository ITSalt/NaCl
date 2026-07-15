import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildReleaseBinding,
  collectReleaseContext,
  deriveCleanHead,
  validateReleaseBinding,
} from "../../../scripts/generate-codex-release-binding.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceRoot = path.join(repoRoot, "codex-plugin-src/package");
const pluginRoot = path.join(repoRoot, "plugins/nacl");
const sourceSha = "a".repeat(40);

async function readJson(root, relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

function git(arguments_, cwd) {
  const result = spawnSync("git", arguments_, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${arguments_.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

test("source and packaged disclosures enumerate the complete bounded data flow and unresolved production decisions", async () => {
  const [source, packaged, metadata, manifest] = await Promise.all([
    readJson(sourceRoot, "submission/data-flow-security.json"),
    readJson(pluginRoot, "submission/data-flow-security.json"),
    readJson(sourceRoot, "submission/release-candidate-metadata.json"),
    readJson(sourceRoot, ".codex-plugin/plugin.json"),
  ]);
  assert.deepEqual(packaged, source);
  assert.equal(source.status, "LOCAL_SOURCE_DISCLOSURE_ONLY");
  assert.equal(source.productionPolicyStatus, "NOT_VERIFIED");
  assert.deepEqual(source.dataCategories.map(({ id }) => id), [
    "oauth-identity",
    "project-graph",
    "mcp-request-result",
    "security-audit",
    "backup-restore",
  ]);
  assert.equal(source.flows.length, 7);
  assert.match(source.topology.authorizationBoundary, /authorized for every NaCl project database configured on that server/);
  const requiredDecisions = {
    publisherIdentity: "NOT_VERIFIED",
    oauthProvider: "NOT_SELECTED",
    subprocessors: "NOT_SELECTED",
    hostingRegions: "NOT_VERIFIED",
    primaryDataRetention: "NOT_VERIFIED",
    auditDataRetention: "NOT_VERIFIED",
    backupRetention: "NOT_VERIFIED",
    deletionProcess: "NOT_VERIFIED",
    exportProcess: "NOT_VERIFIED",
    supportOwner: "NOT_VERIFIED",
    supportContact: "NOT_VERIFIED",
    supportResponseCommitment: "NOT_VERIFIED",
    securityOwner: "NOT_VERIFIED",
    securityContact: "NOT_VERIFIED",
    vulnerabilityReportingProcess: "NOT_VERIFIED",
    securityIncidentProcess: "NOT_VERIFIED",
    publicWebsite: "NOT_VERIFIED",
    publicPrivacyPolicy: "NOT_VERIFIED",
    publicTermsOfService: "NOT_VERIFIED",
  };
  for (const [name, status] of Object.entries(requiredDecisions)) {
    assert.equal(source.productionDecisions[name].status, status, name);
    assert.ok(source.productionDecisions[name].value === null || Array.isArray(source.productionDecisions[name].value));
  }
  assert.equal(source.productionDecisions.modelTraining.sourceImplementationStatus, "DOES_NOT_SEND_TO_AUTHOR_ANALYTICS");
  assert.equal(source.productionDecisions.modelTraining.productionCommitmentStatus, "NOT_VERIFIED");
  assert.equal(source.repositoryPrivacyNotice.productionPublicPolicyStatus, "NOT_VERIFIED");

  assert.equal(metadata.status, "NOT_READY_FOR_SUBMISSION");
  assert.equal(metadata.freezeStatus, "PREFREEZE_NOT_BOUND");
  assert.deepEqual(metadata.releaseBindings.sourceSha, { status: "NOT_BOUND", value: null });
  assert.equal(metadata.releaseBindings.pluginVersion.value, manifest.version);
  assert.equal(metadata.signatures.status, "NOT_SIGNED");
  assert.deepEqual(metadata.signatures.items, []);
  assert.equal(manifest.repository, "https://github.com/ITSalt/NaCl");
  assert.equal(manifest.license, "MIT");
  assert.deepEqual(manifest.keywords, ["developer-tools", "software-delivery", "systems-analysis", "verification"]);
  for (const field of ["homepage", "website", "privacyPolicy", "termsOfService"]) {
    assert.equal(Object.hasOwn(manifest, field), false);
  }

  const combined = `${JSON.stringify(source)}\n${JSON.stringify(metadata)}\n${await readFile(path.join(sourceRoot, "submission/data-flow-security.md"), "utf8")}`;
  assert.doesNotMatch(combined, /plugin_asdk_app_|example\.(?:com|test|invalid)|\/(?:Users|home)\/|@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  assert.doesNotMatch(combined, /\b(?:MATCH|MERGE|DETACH DELETE|DROP DATABASE)\b/);
});

test("release binding derives current hashes, remains explicitly unready, and validates without a signing claim", async () => {
  const context = await collectReleaseContext(repoRoot);
  const binding = buildReleaseBinding({ sourceSha, context });
  assert.equal(validateReleaseBinding(binding, { sourceSha, context }), binding);
  assert.equal(binding.status, "NOT_READY_FOR_SUBMISSION");
  assert.equal(binding.source.value, sourceSha);
  assert.equal(binding.plugin.version.value, context.pluginVersion);
  assert.equal(binding.publicMcp.publicToolsMetadata.sha256, context.publicToolsMetadataSha256);
  assert.equal(binding.publicMcp.serverInstructions.sha256, context.serverInstructionsSha256);
  assert.equal(binding.artifacts.containerImage.status, "NOT_BOUND");
  assert.equal(binding.productionBindings.publicEndpoint.status, "NOT_VERIFIED");
  assert.equal(binding.legalAndOperations.regions.status, "NOT_VERIFIED");
  assert.deepEqual(binding.signatures, { status: "NOT_SIGNED", items: [] });
  assert.doesNotMatch(JSON.stringify(binding), /\/(?:Users|home)\//);
});

test("release binding fails closed for false verification, stale bindings, sensitive values, readiness gaps, and signing claims", async () => {
  const context = await collectReleaseContext(repoRoot);
  const baseline = buildReleaseBinding({ sourceSha, context });
  const cases = [
    ["VERIFIED without value", (value) => { value.productionBindings.publicEndpoint = { status: "VERIFIED", value: null }; }, /VERIFIED without binding evidence/],
    ["wrong source", (value) => { value.source.value = "b".repeat(40); }, /source SHA/],
    ["wrong plugin version", (value) => { value.plugin.version.value = "9.9.9"; }, /plugin version/],
    ["stale skills", (value) => { value.plugin.skills.treeSha256 = "0".repeat(64); }, /skills tree hash/],
    ["stale tools", (value) => { value.publicMcp.publicToolsMetadata.sha256 = "0".repeat(64); }, /public tools metadata hash/],
    ["stale instructions", (value) => { value.publicMcp.serverInstructions.sha256 = "0".repeat(64); }, /server instructions hash/],
    ["personal path", (value) => { value.productionBindings.publicEndpoint.value = "/Users/person/private"; }, /forbidden personal/],
    ["secret", (value) => { value.productionBindings.publicEndpoint.value = "access_token=secret-value"; }, /forbidden personal/],
    ["placeholder", (value) => { value.productionBindings.publicEndpoint.value = "https://example.test/mcp"; }, /forbidden personal/],
    ["false ready", (value) => { value.status = "READY_FOR_SUBMISSION"; }, /critical production bindings remain unresolved/],
    ["false signature", (value) => { value.signatures = { status: "SIGNED", items: [{ value: "not-a-signature" }] }; }, /must not claim signatures/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const candidate = structuredClone(baseline);
    mutate(candidate);
    assert.throws(() => validateReleaseBinding(candidate, { sourceSha, context }), pattern, name);
  }
});

test("clean-head derivation uses the exact Git commit and rejects a dirty synthetic repository", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-release-head-"));
  try {
    git(["init", "-q"], temporary);
    git(["config", "user.email", "release-test@example.invalid"], temporary);
    git(["config", "user.name", "NaCl Release Test"], temporary);
    await writeFile(path.join(temporary, "tracked.txt"), "bound\n");
    git(["add", "tracked.txt"], temporary);
    git(["commit", "-qm", "fixture"], temporary);
    assert.equal(deriveCleanHead(temporary), git(["rev-parse", "HEAD"], temporary));
    await writeFile(path.join(temporary, "untracked.txt"), "dirty\n");
    assert.throws(() => deriveCleanHead(temporary), /clean Git worktree/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("committed pre-freeze metadata contains no hard-coded source SHA or release identity", async () => {
  const [source, packaged] = await Promise.all([
    readFile(path.join(sourceRoot, "submission/release-candidate-metadata.json"), "utf8"),
    readFile(path.join(pluginRoot, "submission/release-candidate-metadata.json"), "utf8"),
  ]);
  assert.deepEqual(packaged, source);
  assert.doesNotMatch(source, /\b[0-9a-f]{40}\b/);
  assert.doesNotMatch(source, /plugin_asdk_app_|https:\/\/[^"/]+\/mcp|sha256:[0-9a-f]{64}/);
});
