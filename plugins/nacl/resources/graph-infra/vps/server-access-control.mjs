#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import {
  accessSync, chmodSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

const CN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{2,127}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;

function die(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function id(value, label) {
  if (typeof value !== "string" || !ID.test(value) || value.includes("..") || /[._-]$/.test(value)) die(`${label.toUpperCase()}_INVALID`, `${label} is malformed`);
  return value;
}

function cn(value) {
  if (typeof value !== "string" || !CN.test(value) || value.includes("..") || /[.:@-]$/.test(value)) die("CN_INVALID", "CN is malformed");
  return value;
}

function cns(text) {
  return [...new Set(text.split(/\r?\n/).filter(Boolean).map(cn))].sort();
}

function atomic(filename, content) {
  const temporary = `${filename}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temporary, content, { mode: 0o600, flag: "wx" });
  chmodSync(temporary, 0o600);
  renameSync(temporary, filename);
}

function parse(argv) {
  const [action, ...rest] = argv;
  const options = { legacy: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key.startsWith("--")) die("ARGUMENT_INVALID", `unknown argument ${key}`);
    const name = key.slice(2);
    const value = rest[++index];
    if (name === "legacy") options.legacy.push(value);
    else options[name] = value;
  }
  return { action, options };
}

function controller(options) {
  const stateDir = path.resolve(options["state-dir"] ?? "");
  if (!path.isAbsolute(options["state-dir"] ?? "")) die("STATE_DIR_INVALID", "state-dir must be absolute");
  const serverId = id(options["server-id"], "server_id");
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  if (lstatSync(stateDir).isSymbolicLink()) die("STATE_DIR_INVALID", "state-dir cannot be a symlink");
  const trustedPath = path.join(stateDir, "trusted-cns");
  const inventoryPath = path.join(stateDir, "gateways.json");
  const lockPath = path.join(stateDir, ".server-access.lock");
  if (!existsSync(trustedPath)) atomic(trustedPath, "");
  if (!existsSync(inventoryPath)) atomic(inventoryPath, `${JSON.stringify({ version: 1, server_id: serverId, authorization_revision: 0, gateways: [] }, null, 2)}\n`);

  function readInventory() {
    const value = JSON.parse(readFileSync(inventoryPath, "utf8"));
    if (value.version !== 1 || value.server_id !== serverId || !Array.isArray(value.gateways)) die("INVENTORY_INVALID", "gateway inventory is invalid");
    return value;
  }
  function readTrusted() { return cns(readFileSync(trustedPath, "utf8")); }
  function writeTrusted(values) { atomic(trustedPath, values.length ? `${values.join("\n")}\n` : ""); }
  function writeInventory(value) { atomic(inventoryPath, `${JSON.stringify(value, null, 2)}\n`); }
  function projectFile(scope) {
    const filename = path.join(stateDir, id(scope, "project_scope"), "allowed-cns");
    if (!filename.startsWith(`${stateDir}${path.sep}`)) die("PROJECT_SCOPE_INVALID", "project scope escapes state-dir");
    return filename;
  }
  function project(values, gateway) {
    const filename = projectFile(gateway.project_scope);
    mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    atomic(filename, values.length ? `${values.join("\n")}\n` : "");
  }
  function selectPort(inventory, rawPort) {
    let port;
    if (rawPort === undefined || rawPort === "auto") {
      const used = new Set(inventory.gateways.map((entry) => entry.gateway_port));
      for (let candidate = 7687; candidate <= 7999; candidate += 1) {
        if (!used.has(candidate)) { port = candidate; break; }
      }
      if (port === undefined) die("GATEWAY_PORT_EXHAUSTED", "no gateway port is available");
    } else port = Number(rawPort);
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) die("GATEWAY_PORT_INVALID", "gateway port is invalid");
    return port;
  }
  function locked(operation) {
    try { mkdirSync(lockPath, { mode: 0o700 }); } catch { die("STATE_LOCKED", "server access state is locked"); }
    try { return operation(); } finally { rmSync(lockPath, { recursive: true, force: true }); }
  }
  function preflightArtifactTree(root) {
    try { accessSync(path.dirname(root), constants.W_OK | constants.X_OK); } catch {
      die("OWNED_ARTIFACT_CLEANUP_FAILED", "project state parent is not renameable");
    }
    function visit(filename) {
      const metadata = lstatSync(filename);
      if (metadata.isSymbolicLink()) die("OWNED_ARTIFACT_CLEANUP_FAILED", "owned project artifacts cannot contain symlinks");
      if (metadata.isDirectory()) {
        try { accessSync(filename, constants.R_OK | constants.W_OK | constants.X_OK); } catch {
          die("OWNED_ARTIFACT_CLEANUP_FAILED", "owned project artifact directory is not fully accessible");
        }
        for (const name of readdirSync(filename).sort()) visit(path.join(filename, name));
      } else if (!metadata.isFile()) die("OWNED_ARTIFACT_CLEANUP_FAILED", "owned project artifacts contain an unsupported file type");
    }
    visit(root);
  }
  function reconcileGrant(next, successCode) {
    const inventory = readInventory();
    const previous = readTrusted();
    try {
      for (const gateway of inventory.gateways) project(next, gateway);
      writeTrusted(next);
      inventory.authorization_revision += 1;
      writeInventory(inventory);
      return { status: "VERIFIED", code: successCode, authorization_revision: inventory.authorization_revision };
    } catch (error) {
      const incomplete = [];
      for (const gateway of inventory.gateways) {
        try { project(previous, gateway); } catch {
          gateway.enabled = false;
          gateway.quarantine_reason = "grant-rollback-incomplete";
          incomplete.push(gateway.project_scope);
        }
      }
      writeTrusted(previous);
      writeInventory(inventory);
      return {
        status: "BLOCKED",
        code: incomplete.length ? "GRANT_ROLLBACK_INCOMPLETE" : "GRANT_ROLLED_BACK",
        error_code: error.code ?? "PROJECTION_FAILED",
        ...(incomplete.length ? { critical_projects: incomplete } : {}),
      };
    }
  }
  function migrationPlan(files) {
    if (!files.length) die("MIGRATION_INPUT_INVALID", "legacy inputs are required");
    const inputs = files.map((filename) => {
      if (!path.isAbsolute(filename) || lstatSync(filename).isSymbolicLink()) die("MIGRATION_INPUT_INVALID", "legacy input must be an absolute regular file");
      const content = readFileSync(filename, "utf8");
      return { path: path.resolve(filename), sha256: createHash("sha256").update(content).digest("hex"), values: cns(content) };
    });
    const proposed = [...new Set(inputs.flatMap((entry) => entry.values))].sort();
    const digest = createHash("sha256").update(JSON.stringify({ server_id: serverId, inputs: inputs.map(({ path: filename, sha256 }) => ({ path: filename, sha256 })), proposed })).digest("hex");
    return { status: "PLANNED", code: "LEGACY_UNION_PLANNED", proposed_trusted_cns: proposed, confirmation: `MIGRATE_SERVER_TRUST:${digest}` };
  }
  return {
    provision(scope, rawPort) {
      return locked(() => {
        const inventory = readInventory();
        const projectScope = id(scope, "project_scope");
        const port = selectPort(inventory, rawPort);
        const existing = inventory.gateways.find((entry) => entry.project_scope === projectScope);
        if (existing) {
          if (existing.gateway_port !== port) die("GATEWAY_COLLISION", "project scope is already allocated to another port");
          project(readTrusted(), existing);
          return { status: "VERIFIED", code: "GATEWAY_ALREADY_PROVISIONED", ...existing };
        }
        if (inventory.gateways.some((entry) => entry.gateway_port === port)) die("GATEWAY_COLLISION", "gateway port is already allocated");
        const gateway = { project_scope: projectScope, gateway_port: port, enabled: true, quarantine_reason: null };
        project(readTrusted(), gateway);
        inventory.gateways.push(gateway);
        inventory.gateways.sort((left, right) => left.project_scope.localeCompare(right.project_scope));
        writeInventory(inventory);
        return { status: "VERIFIED", code: "GATEWAY_PROVISIONED", ...gateway };
      });
    },
    reserve(scope, rawPort) {
      return locked(() => {
        const inventory = readInventory();
        const projectScope = id(scope, "project_scope");
        const port = selectPort(inventory, rawPort);
        const existing = inventory.gateways.find((entry) => entry.project_scope === projectScope);
        if (existing) die("GATEWAY_COLLISION", "project scope is already allocated");
        if (inventory.gateways.some((entry) => entry.gateway_port === port)) die("GATEWAY_COLLISION", "gateway port is already allocated");
        const projectDir = path.dirname(projectFile(projectScope));
        if (existsSync(projectDir)) die("PROJECT_ARTIFACT_COLLISION", "project state directory already exists");
        const reservationToken = randomBytes(16).toString("hex");
        const gateway = {
          project_scope: projectScope,
          gateway_port: port,
          enabled: false,
          provisioning: true,
          reservation_token: reservationToken,
          quarantine_reason: "provisioning",
        };
        inventory.gateways.push(gateway);
        inventory.gateways.sort((left, right) => left.project_scope.localeCompare(right.project_scope));
        writeInventory(inventory);
        return { status: "RESERVED", code: "GATEWAY_RESERVED", project_scope: projectScope, gateway_port: port, reservation_token: reservationToken };
      });
    },
    activate(scope, reservationToken) {
      return locked(() => {
        const inventory = readInventory();
        const projectScope = id(scope, "project_scope");
        const gateway = inventory.gateways.find((entry) => entry.project_scope === projectScope);
        if (!gateway || gateway.provisioning !== true || gateway.release_pending === true || gateway.reservation_token !== reservationToken) die("RESERVATION_MISMATCH", "gateway reservation is missing or stale");
        project(readTrusted(), gateway);
        gateway.enabled = true;
        gateway.provisioning = false;
        delete gateway.reservation_token;
        gateway.quarantine_reason = null;
        writeInventory(inventory);
        return { status: "VERIFIED", code: "GATEWAY_ACTIVATED", project_scope: projectScope, gateway_port: gateway.gateway_port };
      });
    },
    release(scope, reservationToken) {
      return locked(() => {
        const inventory = readInventory();
        const projectScope = id(scope, "project_scope");
        const gateway = inventory.gateways.find((entry) => entry.project_scope === projectScope);
        if (!gateway || gateway.provisioning !== true || gateway.reservation_token !== reservationToken) die("RESERVATION_MISMATCH", "gateway reservation is missing or stale");
        gateway.enabled = false;
        gateway.release_pending = true;
        gateway.quarantine_reason = "release-pending";
        writeInventory(inventory);
        return { status: "PENDING", code: "GATEWAY_RESERVATION_RELEASE_PENDING", project_scope: projectScope, gateway_port: gateway.gateway_port };
      });
    },
    releaseCommit(scope, reservationToken) {
      return locked(() => {
        const inventory = readInventory();
        const projectScope = id(scope, "project_scope");
        const index = inventory.gateways.findIndex((entry) => entry.project_scope === projectScope);
        const gateway = inventory.gateways[index];
        if (!gateway || gateway.provisioning !== true || gateway.release_pending !== true || gateway.reservation_token !== reservationToken) die("RESERVATION_MISMATCH", "gateway release is missing or stale");
        const projectDir = path.dirname(projectFile(projectScope));
        const tokenDigest = createHash("sha256").update(reservationToken).digest("hex").slice(0, 16);
        const tombstone = path.join(stateDir, `.nacl-release-${projectScope}-${tokenDigest}`);
        const projectExists = existsSync(projectDir);
        const tombstoneExists = existsSync(tombstone);
        if (projectExists && tombstoneExists) die("OWNED_ARTIFACT_CLEANUP_FAILED", "project state and its release tombstone both exist");
        let artifactsMoved = false;
        if (projectExists) {
          preflightArtifactTree(projectDir);
          try { renameSync(projectDir, tombstone); } catch (error) {
            die("OWNED_ARTIFACT_CLEANUP_FAILED", `owned project artifacts could not be tombstoned: ${error.message}`);
          }
          artifactsMoved = true;
        } else if (tombstoneExists) {
          preflightArtifactTree(tombstone);
          artifactsMoved = true;
        }
        inventory.gateways.splice(index, 1);
        try {
          writeInventory(inventory);
        } catch (error) {
          inventory.gateways.splice(index, 0, gateway);
          if (artifactsMoved && !existsSync(projectDir) && existsSync(tombstone)) {
            try { renameSync(tombstone, projectDir); } catch (rollbackError) {
              die("OWNED_ARTIFACT_CLEANUP_ROLLBACK_FAILED", `inventory commit failed and artifact rename rollback failed: ${rollbackError.message}`);
            }
          }
          die("OWNED_ARTIFACT_CLEANUP_FAILED", `inventory commit failed after artifact tombstone: ${error.message}`);
        }
        return {
          status: "VERIFIED",
          code: "GATEWAY_RESERVATION_RELEASED",
          project_scope: projectScope,
          gateway_port: gateway.gateway_port,
          artifact_gc_status: artifactsMoved ? "RETAINED" : "NOT_REQUIRED",
          ...(artifactsMoved ? { artifact_tombstone: tombstone } : {}),
        };
      });
    },
    grant(value) {
      return locked(() => {
        const principal = cn(value);
        const previous = readTrusted();
        return reconcileGrant([...new Set([...previous, principal])].sort(), "PRINCIPAL_GRANTED");
      });
    },
    revoke(value) {
      return locked(() => {
        const principal = cn(value);
        const inventory = readInventory();
        const next = readTrusted().filter((entry) => entry !== principal);
        writeTrusted(next);
        const quarantined = [];
        for (const gateway of inventory.gateways) {
          try { project(next, gateway); } catch { gateway.enabled = false; gateway.quarantine_reason = "revoke-projection-stale"; quarantined.push(gateway.project_scope); }
        }
        inventory.authorization_revision += 1;
        writeInventory(inventory);
        return quarantined.length ? { status: "BLOCKED", code: "REVOKE_QUARANTINED", quarantined } : { status: "VERIFIED", code: "PRINCIPAL_REVOKED", authorization_revision: inventory.authorization_revision };
      });
    },
    quarantine(scope, reason) {
      return locked(() => {
        const inventory = readInventory();
        const gateway = inventory.gateways.find((entry) => entry.project_scope === id(scope, "project_scope"));
        if (!gateway) die("GATEWAY_NOT_FOUND", "gateway was not found");
        gateway.enabled = false;
        gateway.quarantine_reason = reason || "reload-failed";
        writeInventory(inventory);
        return { status: "BLOCKED", code: "GATEWAY_QUARANTINED", project_scope: gateway.project_scope };
      });
    },
    migrationPlan(files) {
      return migrationPlan(files);
    },
    migrationApply(files, confirmation) {
      return locked(() => {
        const plan = migrationPlan(files);
        if (confirmation !== plan.confirmation) die("CONFIRMATION_MISMATCH", "migration confirmation is stale or incorrect");
        return reconcileGrant(plan.proposed_trusted_cns, "LEGACY_UNION_MIGRATED");
      });
    },
    inventory() { return readInventory(); },
  };
}

const { action, options } = parse(process.argv.slice(2));
try {
  const api = controller(options);
  let result;
  if (action === "provision") result = api.provision(options.scope, options.port);
  else if (action === "reserve") result = api.reserve(options.scope, options.port);
  else if (action === "activate") result = api.activate(options.scope, options["reservation-token"]);
  else if (action === "release") result = api.release(options.scope, options["reservation-token"]);
  else if (action === "release-commit") result = api.releaseCommit(options.scope, options["reservation-token"]);
  else if (action === "grant") result = api.grant(options.cn);
  else if (action === "revoke") result = api.revoke(options.cn);
  else if (action === "quarantine") result = api.quarantine(options.scope, options.reason);
  else if (action === "migration-plan") result = api.migrationPlan(options.legacy);
  else if (action === "migration-apply") result = api.migrationApply(options.legacy, options.confirmation);
  else if (action === "inventory") result = api.inventory();
  else die("ACTION_INVALID", "unknown action");
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status === "BLOCKED") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ status: "BLOCKED", code: error.code ?? "SERVER_ACCESS_FAILED", message: error.message })}\n`);
  process.exitCode = 1;
}
