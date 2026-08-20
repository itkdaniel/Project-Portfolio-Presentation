import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { randomBytes } from "crypto";
import { log } from "./logger";

type EventType =
  | "project:created"
  | "project:updated"
  | "project:deleted"
  | "booking:created"
  | "inquiry:created"
  | "notification:created";

interface PubSubMessage {
  type: EventType;
  payload: any;
  timestamp: string;
}

interface ConnectionTicket {
  userId: string;
  expiresAt: number;
  expiryTimer: NodeJS.Timeout;
}

class PubSubManager {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private clientUsers: Map<WebSocket, string | null> = new Map();
  private clientExpiryTimers: Map<WebSocket, NodeJS.Timeout> = new Map();
  private connectionTickets: Map<string, ConnectionTicket> = new Map();

  attach(httpServer: Server) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: "/ws",
      handleProtocols: (protocols) => protocols.has("nexus-ticket") ? "nexus-ticket" : false,
    });

    this.wss.on("connection", (ws, request) => {
      const session = this.consumeConnectionTicket(request.headers["sec-websocket-protocol"]);
      if (!session) {
        ws.close(4001, "Authentication required");
        return;
      }

      this.clients.add(ws);
      this.clientUsers.set(ws, session.userId);
      const expiryTimer = setTimeout(() => {
        this.clientUsers.delete(ws);
        this.clientExpiryTimers.delete(ws);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(4001, "Authentication expired");
        }
      }, Math.max(0, session.expiresAt - Date.now()));
      expiryTimer.unref();
      this.clientExpiryTimers.set(ws, expiryTimer);
      log(`WebSocket client connected (${this.clients.size} active)`, "pubsub");

      ws.send(JSON.stringify({
        type: "connected",
        payload: { message: "Subscribed to real-time updates" },
        timestamp: new Date().toISOString(),
      }));

      ws.on("close", () => {
        this.removeClient(ws);
        log(`WebSocket client disconnected (${this.clients.size} active)`, "pubsub");
      });

      ws.on("error", (err) => {
        log(`WebSocket error: ${err.message}`, "pubsub");
        this.removeClient(ws);
      });
    });

    log("PubSub WebSocket server attached on /ws", "pubsub");
  }

  createConnectionTicket(userId: string, tokenExpiresAt: number): string {
    const ticket = randomBytes(32).toString("base64url");
    const expiresAt = Math.min(tokenExpiresAt, Date.now() + 60_000);
    const expiryTimer = setTimeout(() => this.connectionTickets.delete(ticket), expiresAt - Date.now());
    expiryTimer.unref();
    this.connectionTickets.set(ticket, { userId, expiresAt, expiryTimer });
    return ticket;
  }

  publish(type: EventType, payload: any) {
    this.send(type, payload, () => true);
  }

  publishToUser(userId: string, type: EventType, payload: any) {
    this.send(type, payload, (client) => this.clientUsers.get(client) === userId);
  }

  private send(type: EventType, payload: any, shouldDeliver: (client: WebSocket) => boolean) {
    const message: PubSubMessage = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    const data = JSON.stringify(message);
    let delivered = 0;

    for (const client of Array.from(this.clients)) {
      if (client.readyState === WebSocket.OPEN && shouldDeliver(client)) {
        client.send(data);
        delivered++;
      }
    }

    log(`Published ${type} to ${delivered}/${this.clients.size} clients`, "pubsub");
  }

  private removeClient(ws: WebSocket) {
    const expiryTimer = this.clientExpiryTimers.get(ws);
    if (expiryTimer) clearTimeout(expiryTimer);
    this.clientExpiryTimers.delete(ws);
    this.clients.delete(ws);
    this.clientUsers.delete(ws);
  }

  private consumeConnectionTicket(header: string | string[] | undefined): { userId: string; expiresAt: number } | null {
    const protocols = (Array.isArray(header) ? header.join(",") : header ?? "")
      .split(",")
      .map((protocol) => protocol.trim());
    if (protocols[0] !== "nexus-ticket" || !protocols[1]) return null;

    const ticket = this.connectionTickets.get(protocols[1]);
    if (!ticket) return null;
    clearTimeout(ticket.expiryTimer);
    this.connectionTickets.delete(protocols[1]);

    if (ticket.expiresAt <= Date.now()) return null;
    return { userId: ticket.userId, expiresAt: ticket.expiresAt };
  }
}

export const pubsub = new PubSubManager();