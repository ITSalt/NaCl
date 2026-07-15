#!/usr/bin/env node
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { resolveSecretSource } from "./secret-source-contract.mjs";

export async function launchWithSecretSource({ binary, secretSource, env = process.env } = {}) {
  if (typeof binary !== "string" || binary.length === 0) throw new Error("binary is required");
  const secret = await resolveSecretSource(secretSource, { env });
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [], {
      env: { ...env, NEO4J_PASSWORD: secret, NACL_NEO4J_SECRET_SOURCE: secretSource },
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => signal ? reject(new Error("secret launcher terminated")) : resolve(code ?? 1));
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) options[args[index]?.replace(/^--/, "")] = args[index + 1];
  launchWithSecretSource({ binary: options.binary, secretSource: options["secret-source"] }).then(
    (code) => { process.exitCode = code; },
    () => {
      process.stderr.write("secret-source-launcher: provider unavailable\n");
      process.exitCode = 1;
    },
  );
}
