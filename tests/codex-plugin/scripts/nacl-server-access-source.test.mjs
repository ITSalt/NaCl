import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  FileServerAccessRegistry,
  ServerAccessError,
} from "../../../codex-plugin-src/package/runtime/graph-gateway/server-access-registry.mjs";

async function fixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-server-access-"));
  const stateDir = path.join(root, "server-a");
  const registry = new FileServerAccessRegistry({
    stateDir,
    serverId: "server-a",
    portRange: [7443, 7447],
    ...options,
  });
  await registry.initialize();
  return { root, stateDir, registry };
}

async function allowed(stateDir, scope) {
  const text = await readFile(path.join(stateDir, "projects", scope, "allowed-cns"), "utf8");
  return text.trim() === "" ? [] : text.trim().split("\n");
}

test("one server grant routes every registered project, while another server and forged scope fail without inventory leak", async () => {
  const a = await fixture();
  const b = await fixture({ serverId: "server-b", stateDir: path.join(a.root, "server-b") });
  try {
    const first = await a.registry.provisionGateway({ projectScope: "project-a", gatewayPort: 7443 });
    const second = await a.registry.provisionGateway({ projectScope: "project-b" });
    await b.registry.provisionGateway({ projectScope: "project-z", gatewayPort: 8443 });
    assert.equal(first.gateway_port, 7443);
    assert.equal(second.gateway_port, 7444);

    const grant = await a.registry.grantPrincipal("developer.alice");
    assert.equal(grant.status, "VERIFIED");
    assert.deepEqual(await allowed(a.stateDir, "project-a"), ["developer.alice"]);
    assert.deepEqual(await allowed(a.stateDir, "project-b"), ["developer.alice"]);

    const sessionRevision = grant.authorization_revision;
    assert.equal((await a.registry.resolveRoute({ principalCn: "developer.alice", projectScope: "project-a", sessionRevision })).server_id, "server-a");
    assert.equal((await a.registry.resolveRoute({ principalCn: "developer.alice", projectScope: "project-b", sessionRevision })).project_scope, "project-b");

    for (const attempt of [
      () => a.registry.resolveRoute({ principalCn: "developer.alice", projectScope: "project-z", sessionRevision }),
      () => b.registry.resolveRoute({ principalCn: "developer.alice", projectScope: "project-z" }),
      () => a.registry.resolveRoute({ principalCn: "developer.alice", projectScope: "project-a", host: "attacker.invalid" }),
      () => a.registry.resolveRoute({ principalCn: "developer.alice", projectScope: "project-a", neo4jPassword: "forged" }),
    ]) {
      await assert.rejects(attempt, (error) => error instanceof ServerAccessError && error.code === "ACCESS_OR_RESOURCE_NOT_FOUND");
    }
  } finally {
    await rm(a.root, { recursive: true, force: true });
  }
});

test("new gateway inherits authoritative trusted-cns and duplicate ports are rejected atomically", async () => {
  const f = await fixture();
  try {
    await f.registry.grantPrincipal("developer.alice");
    await f.registry.provisionGateway({ projectScope: "project-a", gatewayPort: 7445 });
    assert.deepEqual(await allowed(f.stateDir, "project-a"), ["developer.alice"]);
    await assert.rejects(
      f.registry.provisionGateway({ projectScope: "project-b", gatewayPort: 7445 }),
      (error) => error.code === "GATEWAY_PORT_COLLISION",
    );
    assert.equal((await f.registry.listGateways()).length, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("legacy per-project allow-lists migrate only through reviewed union plan/apply confirmation", async () => {
  const f = await fixture();
  try {
    await f.registry.provisionGateway({ projectScope: "project-a" });
    await f.registry.provisionGateway({ projectScope: "project-b" });
    const legacyA = path.join(f.root, "legacy-a");
    const legacyB = path.join(f.root, "legacy-b");
    await writeFile(legacyA, "developer.alice\n", { mode: 0o600 });
    await writeFile(legacyB, "developer.bob\ndeveloper.alice\n", { mode: 0o600 });
    const plan = await f.registry.planLegacyUnion({ legacyAllowedCnsPaths: [legacyA, legacyB] });
    assert.deepEqual(plan.proposed_trusted_cns, ["developer.alice", "developer.bob"]);
    assert.match(plan.confirmation, /^MIGRATE_SERVER_TRUST:[0-9a-f]{64}$/);
    await assert.rejects(
      f.registry.applyLegacyUnion({ legacyAllowedCnsPaths: [legacyA, legacyB], confirmation: "MIGRATE_SERVER_TRUST:wrong" }),
      (error) => error.code === "CONFIRMATION_MISMATCH",
    );
    assert.deepEqual(await f.registry.listTrustedPrincipals(), []);
    const applied = await f.registry.applyLegacyUnion({ legacyAllowedCnsPaths: [legacyA, legacyB], confirmation: plan.confirmation });
    assert.equal(applied.status, "VERIFIED");
    assert.deepEqual(await allowed(f.stateDir, "project-a"), plan.proposed_trusted_cns);
    assert.deepEqual(await allowed(f.stateDir, "project-b"), plan.proposed_trusted_cns);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("partial grant rolls back; partial revoke disables stale routes and invalidates sessions", async () => {
  let failMode = null;
  const f = await fixture({
    async projectionWriter({ projectScope, trustedCns, writeDefault }) {
      if (failMode === "grant" && projectScope === "project-b" && trustedCns.includes("developer.bob")) throw new Error("injected grant failure");
      if (failMode === "revoke" && projectScope === "project-b" && !trustedCns.includes("developer.alice")) throw new Error("injected revoke failure");
      await writeDefault();
    },
  });
  try {
    await f.registry.provisionGateway({ projectScope: "project-a" });
    await f.registry.provisionGateway({ projectScope: "project-b" });
    const first = await f.registry.grantPrincipal("developer.alice");
    failMode = "grant";
    const grant = await f.registry.grantPrincipal("developer.bob");
    assert.equal(grant.status, "BLOCKED");
    assert.equal(grant.code, "GRANT_ROLLED_BACK");
    assert.deepEqual(await f.registry.listTrustedPrincipals(), ["developer.alice"]);
    assert.deepEqual(await allowed(f.stateDir, "project-a"), ["developer.alice"]);
    assert.deepEqual(await allowed(f.stateDir, "project-b"), ["developer.alice"]);

    failMode = "revoke";
    const revoke = await f.registry.revokePrincipal("developer.alice");
    assert.equal(revoke.status, "BLOCKED");
    assert.equal(revoke.code, "REVOKE_QUARANTINED");
    assert.deepEqual(await f.registry.listTrustedPrincipals(), []);
    const gateways = await f.registry.listGateways();
    assert.equal(gateways.find((entry) => entry.project_scope === "project-b").enabled, false);
    await assert.rejects(
      f.registry.resolveRoute({ principalCn: "developer.alice", projectScope: "project-a", sessionRevision: first.authorization_revision }),
      (error) => error.code === "ACCESS_OR_RESOURCE_NOT_FOUND",
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("malformed CN, scope, symlinked migration input, and unmanaged state are rejected", async () => {
  const f = await fixture();
  try {
    for (const cn of ["ab", "developer/escape", "developer..alice", "developer.", "developer alice"]) {
      await assert.rejects(f.registry.grantPrincipal(cn), (error) => error.code === "CN_INVALID");
    }
    await assert.rejects(f.registry.provisionGateway({ projectScope: "../project" }), (error) => error.code === "PROJECT_SCOPE_INVALID");
    const target = path.join(f.root, "legacy-target");
    const link = path.join(f.root, "legacy-link");
    await writeFile(target, "developer.alice\n");
    await import("node:fs/promises").then(({ symlink }) => symlink(target, link));
    await assert.rejects(f.registry.planLegacyUnion({ legacyAllowedCnsPaths: [link] }), (error) => error.code === "UNMANAGED_OR_SYMLINK_PATH");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
