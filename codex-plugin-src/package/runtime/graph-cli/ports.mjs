import { createHash } from "node:crypto";
import net from "node:net";
import { LOOPBACK_HOST, LifecycleError, assertPort } from "./contracts.mjs";

export class NodePortProbe {
  async isAvailable(port) {
    assertPort(port, "port");
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.once("error", () => resolve(false));
      server.listen({ host: LOOPBACK_HOST, port, exclusive: true }, () => {
        server.close(() => resolve(true));
      });
    });
  }
}

function seed(projectId) {
  return Number.parseInt(createHash("sha256").update(projectId).digest("hex").slice(0, 8), 16);
}

async function checkPort(port, field, portProbe, reserved) {
  assertPort(port, field);
  if (reserved.has(port) || !(await portProbe.isAvailable(port))) {
    throw new LifecycleError("PORT_COLLISION", `${field} is already reserved or in use.`, {
      status: "BLOCKED",
      details: { field, port },
    });
  }
  return port;
}

export async function allocateLoopbackPorts(options) {
  const reserved = new Set(options.reservedPorts ?? []);
  const portProbe = options.portProbe ?? new NodePortProbe();
  if (options.httpPort !== undefined || options.boltPort !== undefined) {
    if (options.httpPort === undefined || options.boltPort === undefined) {
      throw new LifecycleError("PORT_INVALID", "httpPort and boltPort must be supplied together.");
    }
    if (options.httpPort === options.boltPort) {
      throw new LifecycleError("PORT_INVALID", "httpPort and boltPort must be different.");
    }
    return {
      httpPort: await checkPort(options.httpPort, "httpPort", portProbe, reserved),
      boltPort: await checkPort(options.boltPort, "boltPort", portProbe, reserved),
    };
  }

  const offset = seed(options.projectId) % 10_000;
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const candidate = (offset + attempt) % 10_000;
    const httpPort = 20_000 + candidate;
    const boltPort = 40_000 + candidate;
    if (reserved.has(httpPort) || reserved.has(boltPort)) continue;
    if ((await portProbe.isAvailable(httpPort)) && (await portProbe.isAvailable(boltPort))) {
      return { httpPort, boltPort };
    }
  }
  throw new LifecycleError("PORT_COLLISION", "No free loopback port pair is available.", {
    status: "BLOCKED",
  });
}
