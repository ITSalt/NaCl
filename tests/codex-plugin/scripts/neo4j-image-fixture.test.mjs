import assert from "node:assert/strict";
import test from "node:test";
import { prepareExactNeo4jImage } from "./neo4j-image-fixture.mjs";

function fakeDocker(options = {}) {
  const calls = [];
  const identities = new Map(Object.entries(options.identities ?? {}));
  const versions = new Map(Object.entries(options.versions ?? {}));
  const docker = (args) => {
    calls.push([...args]);
    if (args[0] === "image" && args[1] === "inspect") {
      const identity = identities.get(args[2]);
      return identity
        ? { status: 0, stdout: JSON.stringify([{ ...identity, Config: { Labels: identity.labels ?? {} } }]) }
        : { status: 1, stdout: "" };
    }
    if (args[0] === "run") {
      const image = args.at(-2);
      return { status: 0, stdout: `${versions.get(image) ?? "unknown"}\n` };
    }
    if (args[0] === "tag") {
      identities.set(args[2], identities.get(args[1]));
      versions.set(args[2], versions.get(args[1]));
      return { status: 0, stdout: "" };
    }
    return { status: 0, stdout: "" };
  };
  return { docker, calls };
}

const identity = {
  Id: `sha256:${"a".repeat(64)}`,
  RepoDigests: [`neo4j@sha256:${"a".repeat(64)}`],
  Created: "2024-10-15T14:23:38Z",
  Architecture: "arm64",
  Os: "linux",
};

test("mutable source tag is verified as exact 5.24.2 before retagging", () => {
  const fixture = fakeDocker({
    identities: { "neo4j:5.24-community": identity },
    versions: { "neo4j:5.24-community": "5.24.2" },
  });
  const prepared = prepareExactNeo4jImage({ docker: fixture.docker });
  assert.equal(prepared.createdTag, true);
  assert.equal(prepared.version, "5.24.2");
  assert.equal(prepared.identity.id, identity.Id);
  const versionIndex = fixture.calls.findIndex((args) => args[0] === "run");
  const tagIndex = fixture.calls.findIndex((args) => args[0] === "tag");
  assert.ok(versionIndex >= 0 && versionIndex < tagIndex);
});

test("source version mismatch is BLOCKED and never retagged", () => {
  const fixture = fakeDocker({
    identities: { "neo4j:5.24-community": identity },
    versions: { "neo4j:5.24-community": "5.25.0" },
  });
  assert.throws(
    () => prepareExactNeo4jImage({ docker: fixture.docker }),
    (error) => error.status === "BLOCKED" && error.code === "NEO4J_IMAGE_VERSION_MISMATCH",
  );
  assert.equal(fixture.calls.some((args) => args[0] === "tag"), false);
});

test("an existing exact tag is also version-verified and never silently replaced", () => {
  const fixture = fakeDocker({
    identities: { "neo4j:5.24.2-community": identity },
    versions: { "neo4j:5.24.2-community": "5.24.1" },
  });
  assert.throws(
    () => prepareExactNeo4jImage({ docker: fixture.docker }),
    (error) => error.status === "BLOCKED" && error.code === "NEO4J_IMAGE_VERSION_MISMATCH",
  );
  assert.equal(fixture.calls.some((args) => args[0] === "tag"), false);
});
