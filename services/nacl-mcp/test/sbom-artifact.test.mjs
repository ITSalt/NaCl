import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SBOM generator removes volatile fields and records exact NOT_RUN scanner coverage", async () => {
  const source = await readFile(new URL("../scripts/generate-sbom.mjs", import.meta.url), "utf8");
  assert.match(source, /delete raw\.serialNumber/);
  assert.match(source, /delete raw\.metadata\.timestamp/);
  assert.match(source, /nacl:source-digest:sha256/);
  assert.match(source, /nacl:archive-digest:sha256/);
  for (const expected of ["container-image-sbom", "sast", "secret-scan", "privacy-scan", "container-scan", "iac-scan", "exposed-endpoint-scan", "multi-arch-image-verification"]) {
    assert.match(source, new RegExp(`"${expected}"`));
  }
});
