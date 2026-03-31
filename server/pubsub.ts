import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { log } from "./logger";

type EventType = "project:created" | "project:updated" | "project:deleted" | "booking:created" | "inquiry:created";

interface PubSubMessage {
  type: EventType;
  payload: any;
  timestamp: string;
}

class PubSubManager {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  attach(httpServer: Server) {
    this.wss = new WebSocketServer({ server: httpServer, path: "/ws" });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      log(`WebSocket client connected (${this.clients.size} active)`, "pubsub");

      ws.send(JSON.stringify({
        type: "connected",
        payload: { message: "Subscribed to real-time updates" },
        timestamp: new Date().toISOString(),
      }));

      ws.on("close", () => {
        this.clients.delete(ws);
        log(`WebSocket client disconnected (${this.clients.size} active)`, "pubsub");
      });

      ws.on("error", (err) => {
        log(`WebSocket error: ${err.message}`, "pubsub");
        this.clients.delete(ws);
      });
    });

    log("PubSub WebSocket server attached on /ws", "pubsub");
  }

  publish(type: EventType, payload: any) {
    const message: PubSubMessage = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    const data = JSON.stringify(message);
    let delivered = 0;

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
        delivered++;
      }
    }

    log(`Published ${type} to ${delivered}/${this.clients.size} clients`, "pubsub");
  }
}

export const pubsub = new PubSubManager();