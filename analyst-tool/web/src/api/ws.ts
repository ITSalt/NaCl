type MessageHandler = (payload: Record<string, unknown>) => void;

const WS_URL = `ws://${window.location.host}/ws`;
const MAX_BACKOFF_MS = 10_000;

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
    socket.send(JSON.stringify({ op: 'subscribe', channel }));
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
    socket.send(JSON.stringify({ op: 'subscribe', channel }));
  }
}

export function unsubscribe(channel: string, handler: MessageHandler): void {
  const channelHandlers = handlers.get(channel);
  if (!channelHandlers) return;
  channelHandlers.delete(handler);
  if (channelHandlers.size === 0) {
    handlers.delete(channel);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ op: 'unsubscribe', channel }));
    }
  }
}

// Auto-connect on module load
connect();
