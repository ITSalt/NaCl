import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gatewayError } from "./errors.mjs";

const execFileAsync = promisify(execFile);
const KEYCHAIN_REFERENCE = /^keychain:([^/\s]{1,128})\/([^/\s]{1,128})$/;

export function secretReferenceKind(reference) {
  if (KEYCHAIN_REFERENCE.test(reference ?? "")) return "keychain";
  return null;
}

export async function resolveSecret(reference, options = {}) {
  const keychainMatch = KEYCHAIN_REFERENCE.exec(reference ?? "");
  if (keychainMatch) {
    if ((options.platform ?? process.platform) !== "darwin") {
      throw gatewayError(
        "SECRET_BACKEND_UNAVAILABLE",
        "The configured Keychain secret backend requires macOS.",
        { status: "BLOCKED", retryable: false },
      );
    }
    try {
      const execute = options.execFile ?? execFileAsync;
      const { stdout } = await execute(
        "/usr/bin/security",
        ["find-generic-password", "-s", keychainMatch[1], "-a", keychainMatch[2], "-w"],
        { encoding: "utf8", timeout: 5_000, maxBuffer: 64 * 1024 },
      );
      const value = stdout.trimEnd();
      if (value.length < 8) throw new Error("empty secret");
      return value;
    } catch {
      throw gatewayError(
        "SECRET_UNAVAILABLE",
        "The configured Keychain secret reference is missing, locked, or revoked.",
        { status: "BLOCKED", retryable: true },
      );
    }
  }

  throw gatewayError(
    "SECRET_REFERENCE_INVALID",
    "The project profile contains an unsupported secret reference.",
    { status: "FAILED", retryable: false },
  );
}
