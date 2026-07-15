import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const containerfile = new URL("../Containerfile", import.meta.url);

test("container runtime is rootless, digest-pinned, health-checked, and installs production dependencies without scripts", async () => {
  const source = await readFile(containerfile, "utf8");
  assert.match(source, /^ARG NODE_IMAGE=node@sha256:09e2b3d9726018aecf269bd35325f46bf75046a643a66d28360ec71132750ec8$/m);
  assert.match(source, /npm ci --omit=dev --ignore-scripts/);
  assert.match(source, /^USER node$/m);
  assert.match(source, /^HEALTHCHECK /m);
  assert.match(source, /source-digest="\$\{SOURCE_DIGEST\}"/);
  assert.match(source, /archive-digest="\$\{ARCHIVE_DIGEST\}"/);
  assert.doesNotMatch(source, /(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\s*=/i);
  assert.doesNotMatch(source, /COPY\s+\.\s+/);
});
