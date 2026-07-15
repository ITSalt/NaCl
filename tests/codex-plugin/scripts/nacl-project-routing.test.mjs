import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EXPECTED_GATEWAY_SCHEMA } from "../../../plugins/nacl/runtime/graph-cli/contracts.mjs";
import {
  DEFAULT_PROJECT_REGISTRY_ROOT,
  FileProjectRegistryStore,
  createProjectRouter,
  inspectProjectRoot,
} from "../../../plugins/nacl/runtime/graph-cli/project-registry.mjs";
import { DEFAULT_STATE_ROOT } from "../../../plugins/nacl/runtime/graph-cli/instance-store.mjs";
import { createProjectToolGateway } from "../../../plugins/nacl/runtime/graph-gateway/project-tools.mjs";

const candidate = "018f6f7a-2f43-4a8d-8d3b-8de12f6c148a";
const projectA = "01J-WAVE4-PROJECT-A";
const projectB = "01J-WAVE4-PROJECT-B";

test("project tools and the default lifecycle share one external registry root", () => {
  assert.equal(DEFAULT_PROJECT_REGISTRY_ROOT, path.join(DEFAULT_STATE_ROOT, ".project-registry"));
});

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function createRepository(root, config, message = "initial") {
  await writeFile(path.join(root, "config.yaml"), config, "utf8");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "NaCl Test"]);
  git(root, ["config", "user.email", "nacl-test@example.invalid"]);
  git(root, ["add", "config.yaml"]);
  git(root, ["commit", "-q", "-m", message]);
}

async function context(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-project-routing-"));
  const repository = path.join(root, "repository");
  await (await import("node:fs/promises")).mkdir(repository);
  await createRepository(
    repository,
    options.config ?? `project:\n  id: "${options.projectId ?? projectA}"\n  name: "Fixture"\n`,
    options.message,
  );
  const registryRoot = path.join(root, "state", "registry");
  const router = createProjectRouter({
    registryRoot,
    idGenerator: () => candidate,
    clock: () => new Date("2026-07-14T16:00:00.000Z"),
    ...options.routerOptions,
  });
  const tools = createProjectToolGateway({ router });
  return { root, repository, registryRoot, router, tools };
}

test("legacy identity is presented without writes, then confirmed atomically with byte-preserving read-back", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-project-migration-"));
  const repository = path.join(root, "repository");
  const registryRoot = path.join(root, "registry");
  const original = "\uFEFF# retained\r\nproject: # retained header\r\n  name: \"Legacy\" # retained name\r\ngit:\r\n  main: main\r\n";
  await (await import("node:fs/promises")).mkdir(repository);
  await createRepository(repository, original);
  await chmod(path.join(repository, "config.yaml"), 0o640);
  const router = createProjectRouter({
    registryRoot,
    idGenerator: () => candidate,
    clock: () => new Date("2026-07-14T16:01:00.000Z"),
  });
  const tools = createProjectToolGateway({ router });
  try {
    const proposed = await tools.callTool("nacl_project_resolve", { project_root: repository });
    assert.equal(proposed.status, "BLOCKED");
    assert.equal(proposed.code, "PROJECT_ID_MIGRATION_REQUIRED");
    assert.equal(proposed.presentedProjectId, candidate);
    assert.equal(proposed.requiredConfirmation, `MIGRATE_PROJECT_ID:${candidate}`);
    assert.equal(await readFile(path.join(repository, "config.yaml"), "utf8"), original);
    assert.deepEqual(await new FileProjectRegistryStore(registryRoot).list(), []);

    const declined = await tools.callTool("nacl_project_migrate_identity", {
      project_root: repository,
      presented_project_id: candidate,
      confirmation: "MIGRATE_PROJECT_ID:wrong",
    });
    assert.equal(declined.status, "BLOCKED");
    assert.equal(declined.code, "CONFIRMATION_REQUIRED");
    assert.equal(await readFile(path.join(repository, "config.yaml"), "utf8"), original);

    const migrated = await tools.callTool("nacl_project_migrate_identity", {
      project_root: repository,
      presented_project_id: candidate,
      confirmation: `MIGRATE_PROJECT_ID:${candidate}`,
    });
    assert.equal(migrated.status, "VERIFIED", JSON.stringify(migrated));
    assert.equal(migrated.code, "PROJECT_ID_MIGRATED");
    assert.equal(migrated.configReadbackVerified, true);
    const expected = original.replace(
      "project: # retained header\r\n",
      `project: # retained header\r\n  id: "${candidate}"\r\n`,
    );
    assert.equal(await readFile(path.join(repository, "config.yaml"), "utf8"), expected);
    assert.equal((await stat(path.join(repository, "config.yaml"))).mode & 0o777, 0o640);
    const record = await new FileProjectRegistryStore(registryRoot).get(candidate);
    assert.equal(record.projectId, candidate);
    assert.deepEqual(record.registeredRoots, [await (await import("node:fs/promises")).realpath(repository)]);
    assert.equal(record.secretReference, `keychain:com.itsalt.nacl.local-graph/${candidate}`);
    assert.equal(JSON.stringify(record).includes("password"), false);
    assert.equal(JSON.stringify(record).includes("token"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("partial config-versus-registry completion has an explicit confirmed recovery", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-project-partial-"));
  const repository = path.join(root, "repository");
  const registryRoot = path.join(root, "registry");
  await (await import("node:fs/promises")).mkdir(repository);
  await createRepository(repository, "project:\n  name: Legacy\n");
  const realStore = new FileProjectRegistryStore(registryRoot);
  const failingStore = {
    get: (...args) => realStore.get(...args),
    list: (...args) => realStore.list(...args),
    async put() {
      throw new Error("injected registry failure");
    },
  };
  const failing = createProjectRouter({ store: failingStore, idGenerator: () => candidate });
  try {
    await assert.rejects(
      failing.migrateIdentity({
        projectRoot: repository,
        presentedProjectId: candidate,
        confirmation: `MIGRATE_PROJECT_ID:${candidate}`,
      }),
      (error) => {
        assert.equal(error.status, "PARTIALLY_VERIFIED");
        assert.equal(error.code, "PROJECT_MIGRATION_PARTIAL");
        assert.deepEqual(error.details.recovery, {
          action: "project_register_root",
          confirmation: "REGISTER_PROJECT_ROOT",
          automaticRetry: false,
        });
        return true;
      },
    );
    assert.equal((await inspectProjectRoot(repository)).projectId, candidate);
    assert.equal(await realStore.get(candidate), null);

    const recovery = createProjectRouter({ store: realStore });
    const registered = await recovery.registerRoot({
      projectId: candidate,
      projectRoot: repository,
      confirmation: "REGISTER_PROJECT_ROOT",
    });
    assert.equal(registered.record.projectId, candidate);
    assert.equal((await recovery.resolveRegistered({ projectId: candidate, projectRoot: repository })).record.projectId, candidate);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("clone, worktree, and root symlink share one identity while aliases stay canonical", async () => {
  const first = await context();
  const clone = path.join(first.root, "clone");
  const worktree = path.join(first.root, "worktree");
  const rootAlias = path.join(first.root, "root-alias");
  try {
    await first.router.registerRoot({
      projectId: projectA,
      projectRoot: first.repository,
      confirmation: "REGISTER_PROJECT_ROOT",
    });
    git(first.root, ["clone", "-q", first.repository, clone]);
    git(first.repository, ["worktree", "add", "-q", "-b", "wave4-worktree", worktree]);
    await symlink(first.repository, rootAlias, "dir");

    for (const alias of [clone, worktree, rootAlias]) {
      const result = await first.router.registerRoot({
        projectId: projectA,
        projectRoot: alias,
        confirmation: "REGISTER_PROJECT_ROOT",
      });
      assert.equal(result.record.projectId, projectA);
    }
    const record = await new FileProjectRegistryStore(first.registryRoot).get(projectA);
    assert.equal(record.registeredRoots.length, 3, "symlink must collapse to the canonical first root");
    assert.equal((await first.router.resolveRegistered({ projectId: projectA, projectRoot: rootAlias })).canonicalRoot, await (await import("node:fs/promises")).realpath(first.repository));
    const ambiguous = await first.tools.callTool("nacl_project_resolve", {});
    assert.equal(ambiguous.status, "BLOCKED");
    assert.equal(ambiguous.code, "AMBIGUOUS_PROJECT");
    assert.equal(ambiguous.registeredRootCount, 3);
  } finally {
    git(first.repository, ["worktree", "remove", "--force", worktree]);
    await rm(first.root, { recursive: true, force: true });
  }
});

test("copied identity in an unrelated repository fails lineage and confirmation checks", async () => {
  const first = await context();
  const unrelated = path.join(first.root, "unrelated");
  await (await import("node:fs/promises")).mkdir(unrelated);
  await createRepository(
    unrelated,
    `project:\n  id: "${projectA}"\n  name: "Copied identity"\n`,
    "unrelated history",
  );
  try {
    await first.router.registerRoot({
      projectId: projectA,
      projectRoot: first.repository,
      confirmation: "REGISTER_PROJECT_ROOT",
    });
    await assert.rejects(
      first.router.registerRoot({ projectId: projectA, projectRoot: unrelated }),
      (error) => error.code === "CONFIRMATION_REQUIRED" && error.status === "BLOCKED",
    );
    await assert.rejects(
      first.router.registerRoot({
        projectId: projectA,
        projectRoot: unrelated,
        confirmation: "REGISTER_PROJECT_ROOT",
      }),
      (error) => error.code === "PROJECT_LINEAGE_MISMATCH",
    );
    const record = await new FileProjectRegistryStore(first.registryRoot).get(projectA);
    assert.deepEqual(record.registeredRoots, [await (await import("node:fs/promises")).realpath(first.repository)]);
  } finally {
    await rm(first.root, { recursive: true, force: true });
  }
});

test("forged IDs, malformed config, config symlinks, stale aliases, and corrupt records fail closed", async () => {
  const first = await context();
  const malformed = path.join(first.root, "malformed");
  const symlinked = path.join(first.root, "symlinked");
  await (await import("node:fs/promises")).mkdir(malformed);
  await (await import("node:fs/promises")).mkdir(symlinked);
  await createRepository(malformed, "project:\n  id: ok-id\n  id: duplicate-id\n");
  git(symlinked, ["init", "-q"]);
  await symlink(path.join(first.repository, "config.yaml"), path.join(symlinked, "config.yaml"));
  try {
    await first.router.registerRoot({
      projectId: projectA,
      projectRoot: first.repository,
      confirmation: "REGISTER_PROJECT_ROOT",
    });
    await assert.rejects(
      first.router.resolveRegistered({ projectId: projectB, projectRoot: first.repository }),
      (error) => error.code === "PROJECT_MISMATCH",
    );
    await assert.rejects(inspectProjectRoot("."), (error) => error.code === "PROJECT_ROOT_INVALID");
    await assert.rejects(inspectProjectRoot(malformed), (error) => error.code === "PROJECT_CONFIG_INVALID");
    await assert.rejects(inspectProjectRoot(symlinked), (error) => error.code === "PROJECT_CONFIG_UNSAFE");

    const recordPath = new FileProjectRegistryStore(first.registryRoot).filename(projectA);
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.secretValue = "must-never-be-accepted";
    await writeFile(recordPath, `${JSON.stringify(record)}\n`);
    await assert.rejects(
      first.router.resolveRegistered({ projectId: projectA, projectRoot: first.repository }),
      (error) => error.code === "PROJECT_REGISTRY_CORRUPT",
    );
  } finally {
    await rm(first.root, { recursive: true, force: true });
  }
});

test("registry filenames bind the requested project ID before list, resolve, or health writes", async () => {
  const first = await context();
  try {
    await first.router.registerRoot({
      projectId: projectA,
      projectRoot: first.repository,
      confirmation: "REGISTER_PROJECT_ROOT",
    });
    const store = new FileProjectRegistryStore(first.registryRoot);
    const recordPath = store.filename(projectA);
    const valid = JSON.parse(await readFile(recordPath, "utf8"));
    const foreign = {
      ...valid,
      projectId: projectB,
      endpointReference: `local-instance:${projectB}`,
      secretReference: `keychain:com.itsalt.nacl.local-graph/${projectB}`,
    };
    const foreignBytes = `${JSON.stringify(foreign, null, 2)}\n`;
    await writeFile(recordPath, foreignBytes);

    for (const operation of [
      () => store.get(projectA),
      () => store.list(),
      () => first.router.resolveRegistered({ projectId: projectA, projectRoot: first.repository }),
      () => first.router.updateHealth({
        projectId: projectA,
        projectRoot: first.repository,
        status: "VERIFIED",
        code: "GRAPH_HEALTHY",
      }),
    ]) {
      await assert.rejects(
        operation,
        (error) => error.code === "PROJECT_REGISTRY_CORRUPT" && error.status === "FAILED",
      );
    }
    assert.equal(await readFile(recordPath, "utf8"), foreignBytes);
    assert.deepEqual(await readdir(first.registryRoot), [`${projectA}.json`]);
  } finally {
    await rm(first.root, { recursive: true, force: true });
  }
});

test("config inode swap after presentation is blocked before migration commit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-project-toctou-"));
  const repository = path.join(root, "repository");
  await (await import("node:fs/promises")).mkdir(repository);
  await createRepository(repository, "project:\n  name: Legacy\n");
  const configPath = path.join(repository, "config.yaml");
  const router = createProjectRouter({
    registryRoot: path.join(root, "registry"),
    idGenerator: () => candidate,
    beforeConfigRename: async () => {
      const replacement = `${configPath}.replacement`;
      await writeFile(replacement, "project:\n  name: Replaced\n");
      await (await import("node:fs/promises")).rename(replacement, configPath);
    },
  });
  try {
    await assert.rejects(
      router.migrateIdentity({
        projectRoot: repository,
        presentedProjectId: candidate,
        confirmation: `MIGRATE_PROJECT_ID:${candidate}`,
      }),
      (error) => error.code === "PROJECT_CONFIG_CHANGED" && error.status === "BLOCKED",
    );
    assert.equal((await inspectProjectRoot(repository)).projectId, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("same-inode config edits after presentation preserve user bytes and leave no side effects", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-project-content-toctou-"));
  const repository = path.join(root, "repository");
  const registryRoot = path.join(root, "registry");
  await (await import("node:fs/promises")).mkdir(repository);
  await createRepository(repository, "project:\n  name: Legacy\n");
  const configPath = path.join(repository, "config.yaml");
  const original = await lstat(configPath);
  const userBytes = "project:\n  name: User edit while confirmation was pending\n";
  const router = createProjectRouter({
    registryRoot,
    idGenerator: () => candidate,
    beforeConfigRename: async () => {
      await writeFile(configPath, userBytes);
      const changed = await lstat(configPath);
      assert.equal(changed.dev, original.dev);
      assert.equal(changed.ino, original.ino, "fixture must exercise a same-inode in-place edit");
    },
  });
  try {
    await assert.rejects(
      router.migrateIdentity({
        projectRoot: repository,
        presentedProjectId: candidate,
        confirmation: `MIGRATE_PROJECT_ID:${candidate}`,
      }),
      (error) => error.code === "PROJECT_CONFIG_CHANGED" && error.status === "BLOCKED",
    );
    assert.equal(await readFile(configPath, "utf8"), userBytes);
    assert.deepEqual((await readdir(repository)).sort(), [".git", "config.yaml"]);
    assert.equal(await new FileProjectRegistryStore(registryRoot).get(candidate), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("last health is exact, schema/profile fields are immutable, and stale roots fail closed", async () => {
  const first = await context();
  try {
    await first.router.registerRoot({
      projectId: projectA,
      projectRoot: first.repository,
      confirmation: "REGISTER_PROJECT_ROOT",
    });
    const updated = await first.router.updateHealth({
      projectId: projectA,
      projectRoot: first.repository,
      status: "VERIFIED",
      code: "GRAPH_HEALTHY",
    });
    assert.deepEqual(updated.record.lastHealthStatus, {
      status: "VERIFIED",
      code: "GRAPH_HEALTHY",
      checkedAt: "2026-07-14T16:00:00.000Z",
    });
    assert.equal(updated.record.graphMode, "local");
    assert.equal(updated.record.graphProfile, "default");
    assert.equal(updated.record.endpointReference, `local-instance:${projectA}`);
    assert.equal(updated.record.schemaVersion, EXPECTED_GATEWAY_SCHEMA.version);
    await rm(first.repository, { recursive: true, force: true });
    await assert.rejects(
      first.router.resolveRegistered({ projectId: projectA, projectRoot: first.repository }),
      (error) => error.code === "PROJECT_ROOT_UNAVAILABLE" && error.status === "BLOCKED",
    );
  } finally {
    await rm(first.root, { recursive: true, force: true });
  }
});
