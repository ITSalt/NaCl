#!/usr/bin/env node

import http from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function checkHealth(configuration) {
  const resource = new URL(configuration.resourceUrl);
  const listen = configuration.listen;
  if (listen === null || typeof listen !== "object" || !Number.isSafeInteger(listen.port)) throw new Error("listen configuration is invalid");
  const connectHost = ["0.0.0.0", "::", "[::]"].includes(listen.host) ? "127.0.0.1" : listen.host;
  await new Promise((resolve, reject) => {
    const request = http.request({
      host: connectHost,
      port: listen.port,
      path: "/healthz",
      method: "GET",
      headers: { host: resource.host },
      timeout: 2_500,
    }, (response) => {
      response.resume();
      if (response.statusCode === 200) resolve();
      else reject(new Error(`health endpoint returned ${response.statusCode}`));
    });
    request.once("timeout", () => request.destroy(new Error("health endpoint timed out")));
    request.once("error", reject);
    request.end();
  });
}

async function main() {
  const filename = process.env.NACL_MCP_CONFIG_FILE;
  if (typeof filename !== "string" || !path.isAbsolute(filename)) throw new Error("NACL_MCP_CONFIG_FILE is required");
  await checkHealth(JSON.parse(await readFile(filename, "utf8")));
}

const invoked = process.argv[1] ? await realpath(process.argv[1]).catch(() => path.resolve(process.argv[1])) : null;
if (invoked === fileURLToPath(import.meta.url)) await main();
