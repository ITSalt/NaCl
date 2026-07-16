import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITY_POLICY } from "../../../codex-plugin-src/package/runtime/graph-gateway/authorization.mjs";
import { createServerOperationAuthorizer } from "../../../codex-plugin-src/package/runtime/graph-gateway/server-operation-authorization.mjs";

const identity = {
  principal_id: "principal-alice",
  client_id: "client-desktop-01",
  session_id: "session-thread-01",
  worktree_id: "worktree-feature-01",
  branch: "codex/wave9",
  base_sha: "a".repeat(40),
};

function request(projectId, overrides = {}) {
  return {
    project_id: projectId,
    identity,
    capability: "project.read",
    tool_class: CAPABILITY_POLICY["project.read"].toolClass,
    ...overrides,
  };
}

test("one server grant authorizes every project route on that server", async () => {
  const routes = {
    "project-a": { server_id: "server-a", project_scope: "scope-a", enabled: true },
    "project-b": { server_id: "server-a", project_scope: "scope-b", enabled: true },
  };
  const calls = [];
  const authorizer = createServerOperationAuthorizer({
    async resolveProjectRoute({ project_ref }) { return routes[project_ref]; },
    async resolveServerGrant(input) {
      calls.push(input);
      return { server_id: "server-a", principal_id: "principal-alice", role: "developer", active: true, revision: 7 };
    },
  });
  for (const project of Object.keys(routes)) {
    const decision = await authorizer.authorizeProjectOperation(request(project));
    assert.equal(decision.accepted, true);
    assert.equal(decision.server_id, "server-a");
  }
  assert.deepEqual(calls, [
    { server_id: "server-a", principal_id: "principal-alice" },
    { server_id: "server-a", principal_id: "principal-alice" },
  ]);
});

test("cross-server, unknown, disabled, caller routing fields, and forged subject fail closed", async () => {
  const authorizer = createServerOperationAuthorizer({
    async resolveProjectRoute({ project_ref }) {
      if (project_ref === "project-a") return { server_id: "server-a", project_scope: "scope-a", enabled: true };
      if (project_ref === "project-disabled") return { server_id: "server-a", project_scope: "scope-d", enabled: false };
      if (project_ref === "project-z") return { server_id: "server-b", project_scope: "scope-z", enabled: true };
      return null;
    },
    async resolveServerGrant({ server_id, principal_id }) {
      if (server_id === "server-a" && principal_id === "principal-alice") return { server_id, principal_id, role: "developer", active: true, revision: 7 };
      return null;
    },
  });
  for (const project of ["project-z", "project-unknown", "project-disabled"]) {
    const decision = await authorizer.authorizeProjectOperation(request(project));
    assert.equal(decision.accepted, false);
    assert.equal(decision.code, "ACCESS_OR_RESOURCE_NOT_FOUND");
    assert.equal("server_id" in decision, false);
  }
  await assert.rejects(authorizer.authorizeProjectOperation({ ...request("project-a"), server_id: "server-a" }), /invalid field set/i);
  await assert.rejects(authorizer.authorizeProjectOperation({ ...request("project-a"), project_scope: "scope-a" }), /invalid field set/i);
});
