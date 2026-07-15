import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createLocalGraphLifecycle } from "../../../plugins/nacl/runtime/graph-cli/lifecycle.mjs";
import { Neo4jHttpProbe } from "../../../plugins/nacl/runtime/graph-cli/graph-probe.mjs";
import { MemorySecretProvider } from "../../../plugins/nacl/runtime/graph-cli/secret-provider.mjs";
import { createProjectRouter } from "../../../plugins/nacl/runtime/graph-cli/project-registry.mjs";
import { prepareExactNeo4jImage } from "./neo4j-image-fixture.mjs";

const enabled = process.env.NACL_RUN_DOCKER_SMOKE === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const exactImage = "neo4j:5.24.2-community";
const sourceImage = "neo4j:5.24-community";

function docker(args, options = {}) {
  return spawnSync("docker", args, { encoding: "utf8", ...options });
}

async function query(instance, secret, statement, parameters = {}) {
  const authorization = Buffer.from(`neo4j:${secret}`).toString("base64");
  const response = await fetch(`${instance.endpoint.httpUrl}/db/neo4j/tx/commit`, {
    method: "POST",
    headers: { authorization: `Basic ${authorization}`, "content-type": "application/json" },
    body: JSON.stringify({ statements: [{ statement, parameters }] }),
  });
  assert.equal(response.ok, true);
  const payload = await response.json();
  assert.deepEqual(payload.errors, []);
  return payload.results[0]?.data?.[0]?.row ?? [];
}

test(
  "real disposable Docker smoke keeps data over stop and cache-root replacement",
  { skip: !enabled },
  async () => {
    const daemon = docker(["version", "--format", "{{.Server.Version}}"]).status === 0;
    if (!daemon) return test.skip("Docker daemon is unavailable");
    const preparedImage = prepareExactNeo4jImage({ docker, exactImage, sourceImage });
    const createdTag = preparedImage.createdTag;
    assert.equal(preparedImage.version, "5.24.2");
    assert.match(preparedImage.identity.id, /^sha256:[a-f0-9]{64}$/);

    const root = await mkdtemp(path.join(os.tmpdir(), "nacl-real-docker-smoke-"));
    const stateRoot = path.join(root, "state");
    const projectId = `wave3-smoke-${Date.now()}-${process.pid}`;
    const projectRoot = path.join(root, "project");
    await mkdir(projectRoot);
    await writeFile(path.join(projectRoot, "config.yaml"), `project:\n  id: "${projectId}"\n`);
    const projectRouter = createProjectRouter({
      registryRoot: path.join(stateRoot, ".project-registry"),
      repositoryIdentity: async () => `git-roots-sha256:${"a".repeat(64)}`,
    });
    await projectRouter.registerRoot({
      projectId,
      projectRoot,
      confirmation: "REGISTER_PROJECT_ROOT",
    });
    const secret = `disposable-${Date.now()}-${process.pid}-graph-secret`;
    const secrets = new MemorySecretProvider();
    const common = {
      stateRoot,
      projectRouter,
      secretProvider: secrets,
      secretGenerator: () => secret,
      graphProbe: new Neo4jHttpProbe({ attempts: 60, delayMs: 500 }),
      pluginRoot,
    };
    let instance;
    try {
      const lifecycle = createLocalGraphLifecycle(common);
      const initialized = await lifecycle.init({ projectId, projectRoot });
      assert.equal(initialized.status, "VERIFIED");
      instance = initialized.instance;
      const firstStart = await lifecycle.start({ projectId, projectRoot });
      assert.equal(firstStart.code, "SCHEMA_MISSING");
      assert.equal(firstStart.status, "BLOCKED");

      await query(instance, secret, "CREATE (:LifecycleSmoke {id: $id}) RETURN 1", { id: projectId });
      const firstStop = await lifecycle.stop({ projectId, projectRoot });
      assert.equal(firstStop.status, "VERIFIED");
      assert.equal(docker(["volume", "inspect", instance.volumeName]).status, 0);

      const replacementPluginRoot = path.join(root, "simulated-new-cache-root");
      await mkdir(path.join(replacementPluginRoot, "graph", "compose"), { recursive: true });
      await cp(
        path.join(pluginRoot, "graph", "compose", "local-neo4j.compose.yml"),
        path.join(replacementPluginRoot, "graph", "compose", "local-neo4j.compose.yml"),
      );
      const replacement = createLocalGraphLifecycle({
        ...common,
        pluginRoot: replacementPluginRoot,
      });
      const resolved = await replacement.resolve({ projectId, projectRoot });
      assert.deepEqual(resolved.instance, instance);
      const secondStart = await replacement.start({ projectId, projectRoot });
      assert.equal(secondStart.code, "SCHEMA_MISSING");
      const [count] = await query(
        instance,
        secret,
        "MATCH (marker:LifecycleSmoke {id: $id}) RETURN count(marker)",
        { id: projectId },
      );
      assert.equal(count, 1);
      assert.equal((await replacement.stop({ projectId, projectRoot })).status, "VERIFIED");
    } finally {
      if (instance) {
        docker(["container", "rm", "--force", instance.containerName]);
        docker(["volume", "rm", instance.volumeName]);
        docker(["network", "rm", `${instance.composeProject}_default`]);
      }
      await rm(root, { recursive: true, force: true });
      if (createdTag) docker(["image", "rm", exactImage]);
    }
  },
);
