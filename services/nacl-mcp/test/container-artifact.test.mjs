import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import { checkHealth } from "../src/healthcheck.mjs";

const containerfile = new URL("../Containerfile", import.meta.url);

test("container runtime is rootless, digest-pinned, health-checked, and installs production dependencies without scripts", async () => {
  const source = await readFile(containerfile, "utf8");
  assert.equal((source.match(/^FROM node@sha256:09e2b3d9726018aecf269bd35325f46bf75046a643a66d28360ec71132750ec8/gm) ?? []).length, 2);
  assert.doesNotMatch(source, /ARG NODE_IMAGE/);
  assert.match(source, /npm ci --omit=dev --ignore-scripts/);
  assert.match(source, /^USER node$/m);
  assert.match(source, /^HEALTHCHECK /m);
  assert.match(source, /source-digest="\$\{SOURCE_DIGEST\}"/);
  assert.match(source, /archive-digest="\$\{ARCHIVE_DIGEST\}"/);
  assert.match(source, /image\.revision="\$\{VCS_REVISION\}"/);
  assert.match(source, /\^\[0-9a-f\]\{64\}\$/);
  assert.match(source, /\^\[0-9a-f\]\{40\}\$/);
  assert.doesNotMatch(source, /(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\s*=/i);
  assert.doesNotMatch(source, /COPY\s+\.\s+/);
});

test("container healthcheck connects locally while sending the production resource Host", async (t) => {
  const expectedHost = "mcp.example.test";
  const server = http.createServer((request, response) => {
    response.writeHead(request.headers.host === expectedHost && request.url === "/healthz" ? 200 : 421);
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  await checkHealth({
    resourceUrl: `https://${expectedHost}/mcp`,
    listen: { host: "127.0.0.1", port: server.address().port },
  });
});
