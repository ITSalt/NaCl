import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const SERVER_ROUTE = /^server-route:([A-Za-z0-9][A-Za-z0-9._-]{2,127})$/;

export function validateSecretSource(value) {
  if (value === "env:NEO4J_PASSWORD") return Object.freeze({ kind: "env", reference: value, envName: "NEO4J_PASSWORD" });
  const match = typeof value === "string" ? value.match(SERVER_ROUTE) : null;
  if (!match || match[1].includes("..") || /[._-]$/.test(match[1])) throw new Error("secret_source is invalid");
  return Object.freeze({ kind: "server-route", reference: value, routeId: match[1] });
}

async function commandProvider(parsed, env) {
  const command = env.NACL_SERVER_ROUTE_SECRET_PROVIDER;
  if (!command) throw new Error("server route secret provider unavailable");
  const { stdout } = await execFileAsync(command, [], {
    env: { ...env, NACL_SECRET_SOURCE_REFERENCE: parsed.reference, NACL_SERVER_ROUTE_ID: parsed.routeId },
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  return stdout.replace(/[\r\n]+$/, "");
}

export async function resolveSecretSource(value, { env = process.env, serverRouteProvider } = {}) {
  const parsed = validateSecretSource(value);
  let secret;
  if (parsed.kind === "env") secret = env[parsed.envName];
  else secret = await (serverRouteProvider ?? ((input) => commandProvider(input, env)))(parsed);
  if (typeof secret !== "string" || secret.length === 0 || secret.includes("\0")) throw new Error(`${parsed.kind} secret provider unavailable`);
  return secret;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, value] = process.argv.slice(2);
  if (action !== "--resolve" || value === undefined) {
    process.stderr.write("usage: secret-source-contract.mjs --resolve <opaque-reference>\n");
    process.exitCode = 2;
  } else {
    resolveSecretSource(value).then(
      (secret) => process.stdout.write(secret),
      () => {
        process.stderr.write("secret-source-contract: provider unavailable\n");
        process.exitCode = 1;
      },
    );
  }
}
