type MessageHandler = (payload: Record<string, unknown>) => void;

const WS_URL = `ws://${window.location.host}/ws`;
const MAX_BACKOFF_MS = 10_000;

/**
 * Stable per-client session token. Generated once at module load (one UUID per
 * browser tab). The same value is sent in every WS subscribe message and in
 * every PUT /boards/:name request body so the server can echo it back in
 * board.changed, letting this client suppress its own writes.
 */
export const originId: string = crypto.randomUUID();

type ChannelHandlers = Map<MessageHandler, true>;
const handlers = new Map<string, ChannelHandlers>();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = 500;
let connected = false;

const connectionListeners = new Set<(connected: boolean) => void>();

export function onConnectionChange(fn: (connected: boolean) => void): () => void {
  connectionListeners.add(fn);
  fn(connected);
  return () => connectionListeners.delete(fn);
}

function notifyConnectionChange(state: boolean): void {
  connected = state;
  for (const fn of connectionListeners) {
    fn(state);
  }
}

function resubscribeAll(): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  for (const channel of handlers.keys()) {
    socket.send(JSON.stringify({ type: 'subscribe', channel, originId }));
  }
}

function connect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    backoffMs = 500;
    notifyConnectionChange(true);
    resubscribeAll();
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as Record<string, unknown>;
      const channel = msg['channel'];
      if (typeof channel !== 'string') return;
      const channelHandlers = handlers.get(channel);
      if (!channelHandlers) return;
      for (const handler of channelHandlers.keys()) {
        handler(msg);
      }
    } catch {
      // ignore malformed messages
    }
  };

  socket.onclose = () => {
    notifyConnectionChange(false);
    scheduleReconnect();
  };

  socket.onerror = () => {
    // onclose will fire after onerror
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    connect();
  }, backoffMs);
}

export function subscribe(channel: string, handler: MessageHandler): void {
  if (!handlers.has(channel)) {
    handlers.set(channel, new Map());
  }
  handlers.get(channel)!.set(handler, true);

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', channel, originId }));
  }
}

export function unsubscribe(channel: string, handler: MessageHandler): void {
  const channelHandlers = handlers.get(channel);
  if (!channelHandlers) return;
  channelHandlers.delete(handler);
  if (channelHandlers.size === 0) {
    handlers.delete(channel);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'unsubscribe', channel }));
    }
  }
}

// Auto-connect on module load
connect();

// ---------------------------------------------------------------------------
// Test helper — expose originId and a WS message injector on window so that
// Playwright e2e tests can inject synthetic server events without a live WS.
// Only installed in non-production or when the test hook is requested.
// ---------------------------------------------------------------------------

export function exposeTestHooks(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  w.__originId = originId;
  w.__injectWsMessage = (msg: Record<string, unknown>) => {
    const channel = typeof msg['channel'] === 'string' ? msg['channel'] : null;
    if (!channel) return;
    const channelHandlers = handlers.get(channel);
    if (!channelHandlers) return;
    for (const handler of channelHandlers.keys()) {
      handler(msg);
    }
  };
}

// Always expose in the browser (safe — this is a local dev tool, not a public app)
exposeTestHooks();

// Expose handler channel count for debugging (dev tool only)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__wsChannels = () => Array.from(handlers.keys());
