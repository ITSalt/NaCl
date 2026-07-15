import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

const CN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{2,127}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const INVENTORY_VERSION = 1;

export class ServerAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ServerAccessError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ServerAccessError(code, message);
}

function validateIdentifier(value, code, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value) || value.includes("..") || /[._-]$/.test(value)) {
    fail(code, `${label} is malformed.`);
  }
  return value;
}

export function validatePrincipalCn(value) {
  if (
    typeof value !== "string" ||
    !CN.test(value) ||
    value.includes("..") ||
    /[.:@-]$/.test(value)
  ) {
    fail("CN_INVALID", "The certificate CN is malformed.");
  }
  return value;
}

function normalizedCns(values) {
  return [...new Set(values.map(validatePrincipalCn))].sort();
}

function serializeCns(values) {
  return values.length === 0 ? "" : `${values.join("\n")}\n`;
}

function parseCns(text) {
  return normalizedCns(text.split(/\r?\n/).filter((value) => value.length > 0));
}

function inside(root, filename) {
  const resolved = path.resolve(filename);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

async function atomicWrite(filename, content, mode = 0o600) {
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  const handle = await open(temporary, "wx", mode);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporary, mode);
  await rename(temporary, filename);
  const directory = await open(path.dirname(filename), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function inventoryText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export class FileServerAccessRegistry {
  #stateDir;
  #serverId;
  #portRange;
  #projectionWriter;

  constructor({ stateDir, serverId, portRange = [7443, 7999], projectionWriter } = {}) {
    if (typeof stateDir !== "string" || !path.isAbsolute(stateDir)) fail("STATE_DIR_INVALID", "stateDir must be absolute.");
    this.#stateDir = path.resolve(stateDir);
    this.#serverId = validateIdentifier(serverId, "SERVER_ID_INVALID", "serverId");
    if (
      !Array.isArray(portRange) ||
      portRange.length !== 2 ||
      !portRange.every((value) => Number.isSafeInteger(value) && value >= 1024 && value <= 65535) ||
      portRange[0] > portRange[1]
    ) fail("PORT_RANGE_INVALID", "portRange is invalid.");
    this.#portRange = [...portRange];
    if (projectionWriter !== undefined && typeof projectionWriter !== "function") fail("PROJECTION_WRITER_INVALID", "projectionWriter must be a function.");
    this.#projectionWriter = projectionWriter;
  }

  get #trustedPath() { return path.join(this.#stateDir, "trusted-cns"); }
  get #inventoryPath() { return path.join(this.#stateDir, "gateways.json"); }
  get #lockPath() { return path.join(this.#stateDir, ".server-access.lock"); }

  #allowedPath(projectScope) {
    const scope = validateIdentifier(projectScope, "PROJECT_SCOPE_INVALID", "projectScope");
    const filename = path.join(this.#stateDir, "projects", scope, "allowed-cns");
    if (!inside(this.#stateDir, filename)) fail("PROJECT_SCOPE_INVALID", "projectScope escapes stateDir.");
    return filename;
  }

  async initialize() {
    await mkdir(this.#stateDir, { recursive: true, mode: 0o700 });
    const metadata = await lstat(this.#stateDir);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) fail("UNMANAGED_OR_SYMLINK_PATH", "stateDir must be a managed directory.");
    await chmod(this.#stateDir, 0o700);
    try {
      await lstat(this.#trustedPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await atomicWrite(this.#trustedPath, "");
    }
    try {
      const existing = await this.#readInventory();
      if (existing.server_id !== this.#serverId) fail("SERVER_ID_MISMATCH", "Existing inventory belongs to another server.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await atomicWrite(this.#inventoryPath, inventoryText({
        version: INVENTORY_VERSION,
        server_id: this.#serverId,
        authorization_revision: 0,
        gateways: [],
      }));
    }
    return { status: "VERIFIED", server_id: this.#serverId };
  }

  async #withLock(operation) {
    try {
      await mkdir(this.#lockPath, { mode: 0o700 });
    } catch (error) {
      if (error.code === "EEXIST") fail("SERVER_STATE_LOCKED", "Another server authorization mutation is active.");
      throw error;
    }
    try {
      return await operation();
    } finally {
      await rm(this.#lockPath, { recursive: true, force: true });
    }
  }

  async #readInventory() {
    const metadata = await lstat(this.#inventoryPath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) fail("UNMANAGED_OR_SYMLINK_PATH", "Gateway inventory is unmanaged.");
    const value = JSON.parse(await readFile(this.#inventoryPath, "utf8"));
    if (
      value?.version !== INVENTORY_VERSION ||
      value.server_id !== this.#serverId ||
      !Number.isSafeInteger(value.authorization_revision) ||
      value.authorization_revision < 0 ||
      !Array.isArray(value.gateways)
    ) fail("SERVER_STATE_CORRUPT", "Gateway inventory is malformed.");
    for (const gateway of value.gateways) {
      validateIdentifier(gateway.project_scope, "SERVER_STATE_CORRUPT", "gateway project scope");
      if (!Number.isSafeInteger(gateway.gateway_port) || gateway.gateway_port < 1024 || gateway.gateway_port > 65535 || typeof gateway.enabled !== "boolean") {
        fail("SERVER_STATE_CORRUPT", "Gateway inventory entry is malformed.");
      }
    }
    if (new Set(value.gateways.map((entry) => entry.project_scope)).size !== value.gateways.length || new Set(value.gateways.map((entry) => entry.gateway_port)).size !== value.gateways.length) {
      fail("SERVER_STATE_CORRUPT", "Gateway inventory contains duplicate scope or port.");
    }
    return value;
  }

  async #readTrusted() {
    const metadata = await lstat(this.#trustedPath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) fail("UNMANAGED_OR_SYMLINK_PATH", "trusted-cns is unmanaged.");
    return parseCns(await readFile(this.#trustedPath, "utf8"));
  }

  async #writeInventory(inventory) {
    await atomicWrite(this.#inventoryPath, inventoryText(inventory));
  }

  async #writeTrusted(values) {
    await atomicWrite(this.#trustedPath, serializeCns(values));
  }

  async #writeProjection(gateway, trustedCns) {
    const filename = this.#allowedPath(gateway.project_scope);
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    const writeDefault = () => atomicWrite(filename, serializeCns(trustedCns));
    if (this.#projectionWriter) {
      await this.#projectionWriter({
        serverId: this.#serverId,
        projectScope: gateway.project_scope,
        gatewayPort: gateway.gateway_port,
        trustedCns: [...trustedCns],
        writeDefault,
      });
    } else await writeDefault();
  }

  async listTrustedPrincipals() {
    return this.#readTrusted();
  }

  async listGateways() {
    return structuredClone((await this.#readInventory()).gateways);
  }

  async provisionGateway({ projectScope, gatewayPort } = {}) {
    const scope = validateIdentifier(projectScope, "PROJECT_SCOPE_INVALID", "projectScope");
    return this.#withLock(async () => {
      const [inventory, trusted] = await Promise.all([this.#readInventory(), this.#readTrusted()]);
      if (inventory.gateways.some((entry) => entry.project_scope === scope)) fail("PROJECT_SCOPE_COLLISION", "The project gateway is already registered.");
      let selected = gatewayPort;
      if (selected === undefined) {
        const used = new Set(inventory.gateways.map((entry) => entry.gateway_port));
        for (let port = this.#portRange[0]; port <= this.#portRange[1]; port += 1) {
          if (!used.has(port)) { selected = port; break; }
        }
        if (selected === undefined) fail("GATEWAY_PORT_EXHAUSTED", "No gateway port is available.");
      }
      if (!Number.isSafeInteger(selected) || selected < 1024 || selected > 65535) fail("GATEWAY_PORT_INVALID", "gatewayPort is invalid.");
      if (inventory.gateways.some((entry) => entry.gateway_port === selected)) fail("GATEWAY_PORT_COLLISION", "gatewayPort is already allocated.");
      const gateway = { project_scope: scope, gateway_port: selected, enabled: true, quarantine_reason: null };
      await this.#writeProjection(gateway, trusted);
      inventory.gateways.push(gateway);
      inventory.gateways.sort((left, right) => left.project_scope.localeCompare(right.project_scope));
      try {
        await this.#writeInventory(inventory);
      } catch (error) {
        await rm(path.dirname(this.#allowedPath(scope)), { recursive: true, force: true });
        throw error;
      }
      return Object.freeze({ status: "VERIFIED", server_id: this.#serverId, ...gateway });
    });
  }

  async #grantSet(next, successCode) {
    const inventory = await this.#readInventory();
    const previous = await this.#readTrusted();
    const written = [];
    try {
      for (const gateway of inventory.gateways) {
        await this.#writeProjection(gateway, next);
        written.push(gateway);
      }
      await this.#writeTrusted(next);
      inventory.authorization_revision += 1;
      await this.#writeInventory(inventory);
      return Object.freeze({ status: "VERIFIED", code: successCode, authorization_revision: inventory.authorization_revision, trusted_count: next.length });
    } catch {
      let rollbackFailed = false;
      for (const gateway of written) {
        try { await this.#writeProjection(gateway, previous); } catch { rollbackFailed = true; }
      }
      await this.#writeTrusted(previous);
      return Object.freeze({ status: "BLOCKED", code: rollbackFailed ? "GRANT_ROLLBACK_INCOMPLETE" : "GRANT_ROLLED_BACK", authorization_revision: inventory.authorization_revision });
    }
  }

  async grantPrincipal(principalCn) {
    const cn = validatePrincipalCn(principalCn);
    return this.#withLock(async () => {
      const previous = await this.#readTrusted();
      if (previous.includes(cn)) {
        const inventory = await this.#readInventory();
        return Object.freeze({ status: "VERIFIED", code: "ALREADY_GRANTED", authorization_revision: inventory.authorization_revision, trusted_count: previous.length });
      }
      return this.#grantSet(normalizedCns([...previous, cn]), "PRINCIPAL_GRANTED");
    });
  }

  async revokePrincipal(principalCn) {
    const cn = validatePrincipalCn(principalCn);
    return this.#withLock(async () => {
      const [inventory, previous] = await Promise.all([this.#readInventory(), this.#readTrusted()]);
      if (!previous.includes(cn)) return Object.freeze({ status: "VERIFIED", code: "ALREADY_REVOKED", authorization_revision: inventory.authorization_revision, trusted_count: previous.length });
      const next = previous.filter((value) => value !== cn);
      await this.#writeTrusted(next);
      const failed = [];
      for (const gateway of inventory.gateways) {
        try {
          await this.#writeProjection(gateway, next);
        } catch {
          gateway.enabled = false;
          gateway.quarantine_reason = "authorization-projection-stale";
          failed.push(gateway.project_scope);
        }
      }
      inventory.authorization_revision += 1;
      await this.#writeInventory(inventory);
      if (failed.length > 0) return Object.freeze({ status: "BLOCKED", code: "REVOKE_QUARANTINED", authorization_revision: inventory.authorization_revision, quarantined_projects: failed });
      return Object.freeze({ status: "VERIFIED", code: "PRINCIPAL_REVOKED", authorization_revision: inventory.authorization_revision, trusted_count: next.length });
    });
  }

  async rotatePrincipal(previousCn, nextCn) {
    validatePrincipalCn(previousCn);
    validatePrincipalCn(nextCn);
    const grant = await this.grantPrincipal(nextCn);
    if (grant.status !== "VERIFIED") return grant;
    return this.revokePrincipal(previousCn);
  }

  async planLegacyUnion({ legacyAllowedCnsPaths } = {}) {
    if (!Array.isArray(legacyAllowedCnsPaths) || legacyAllowedCnsPaths.length === 0) fail("MIGRATION_INPUT_INVALID", "At least one legacy allow-list is required.");
    const all = [];
    const inputs = [];
    for (const filename of legacyAllowedCnsPaths) {
      if (typeof filename !== "string" || !path.isAbsolute(filename)) fail("UNMANAGED_OR_SYMLINK_PATH", "Legacy allow-list path must be absolute.");
      const metadata = await lstat(filename);
      if (metadata.isSymbolicLink() || !metadata.isFile()) fail("UNMANAGED_OR_SYMLINK_PATH", "Legacy allow-list must be a regular file.");
      const content = await readFile(filename, "utf8");
      const cns = parseCns(content);
      all.push(...cns);
      inputs.push({ path: path.resolve(filename), sha256: createHash("sha256").update(content).digest("hex") });
    }
    const proposed = normalizedCns(all);
    const digest = createHash("sha256").update(JSON.stringify({ server_id: this.#serverId, inputs, proposed })).digest("hex");
    return Object.freeze({
      status: "PLANNED",
      server_id: this.#serverId,
      proposed_trusted_cns: proposed,
      input_count: inputs.length,
      confirmation: `MIGRATE_SERVER_TRUST:${digest}`,
    });
  }

  async applyLegacyUnion({ legacyAllowedCnsPaths, confirmation } = {}) {
    return this.#withLock(async () => {
      const plan = await this.planLegacyUnion({ legacyAllowedCnsPaths });
      if (confirmation !== plan.confirmation) fail("CONFIRMATION_MISMATCH", "Migration confirmation does not match current inputs.");
      return this.#grantSet(plan.proposed_trusted_cns, "LEGACY_UNION_MIGRATED");
    });
  }

  async resolveRoute(input) {
    const allowedKeys = new Set(["principalCn", "projectScope", "sessionRevision"]);
    if (input === null || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowedKeys.has(key))) {
      fail("ACCESS_OR_RESOURCE_NOT_FOUND", "Access or project route was not found.");
    }
    let cn;
    let scope;
    try {
      cn = validatePrincipalCn(input.principalCn);
      scope = validateIdentifier(input.projectScope, "PROJECT_SCOPE_INVALID", "projectScope");
    } catch {
      fail("ACCESS_OR_RESOURCE_NOT_FOUND", "Access or project route was not found.");
    }
    const [inventory, trusted] = await Promise.all([this.#readInventory(), this.#readTrusted()]);
    const gateway = inventory.gateways.find((entry) => entry.project_scope === scope);
    if (
      !trusted.includes(cn) ||
      !gateway?.enabled ||
      (input.sessionRevision !== undefined && input.sessionRevision !== inventory.authorization_revision)
    ) fail("ACCESS_OR_RESOURCE_NOT_FOUND", "Access or project route was not found.");
    return Object.freeze({
      server_id: this.#serverId,
      project_scope: gateway.project_scope,
      gateway_port: gateway.gateway_port,
      authorization_revision: inventory.authorization_revision,
    });
  }
}
