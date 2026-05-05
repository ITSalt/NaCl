import type { WebSocket } from '@fastify/websocket';

type Channel = string;

const subscriptions = new Map<Channel, Set<WebSocket>>();

export function subscribe(channel: Channel, socket: WebSocket): void {
  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, new Set());
  }
  subscriptions.get(channel)!.add(socket);
}

export function unsubscribe(channel: Channel, socket: WebSocket): void {
  subscriptions.get(channel)?.delete(socket);
}

export function unsubscribeAll(socket: WebSocket): void {
  for (const sockets of subscriptions.values()) {
    sockets.delete(socket);
  }
}

export function broadcast(channel: Channel, payload: Record<string, unknown>): void {
  const sockets = subscriptions.get(channel);
  if (!sockets) return;
  const message = JSON.stringify({ channel, ...payload });
  for (const socket of sockets) {
    try {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    } catch {
      // Socket closed mid-send; will be cleaned up on close event
    }
  }
}
