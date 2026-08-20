import { useEffect, useRef, useCallback } from "react";
import { queryClient } from "./queryClient";

type EventHandler = (payload: any) => void;

let ws: WebSocket | null = null;
let wsToken: string | null = null;
let ticketRequestToken: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const handlers = new Map<string, Set<EventHandler>>();

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("nexus_token") : null;
}

function getWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function scheduleReconnect() {
  if (!reconnectTimer) {
    reconnectTimer = setTimeout(connect, 3000);
  }
}

async function connect() {
  const token = getToken();
  if (!token) return;
  if (ticketRequestToken === token) return;
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    if (wsToken === token) return;
    const previous = ws;
    ws = null;
    wsToken = null;
    previous.close();
  }

  ticketRequestToken = token;
  try {
    const response = await fetch("/api/realtime-ticket", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to create real-time ticket: ${response.status}`);
    const { ticket } = await response.json() as { ticket: string };
    if (ticketRequestToken !== token || !ticket || token !== getToken()) return;

    ticketRequestToken = null;
    wsToken = token;
    const socket = new WebSocket(getWsUrl(), ["nexus-ticket", ticket]);
    ws = socket;

    socket.onopen = () => {
      console.log("[pubsub] connected");
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, payload } = message;

        const typeHandlers = handlers.get(type);
        if (typeHandlers) {
          typeHandlers.forEach((handler) => handler(payload));
        }

        if (type === "project:created" || type === "project:updated" || type === "project:deleted") {
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        }
        if (type === "booking:created") {
          queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        }
        if (type === "inquiry:created") {
          queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
        }
      } catch {
      }
    };

    socket.onclose = (event) => {
      if (ws !== socket) return;
      ws = null;
      wsToken = null;
      if (event.code === 4001) {
        console.log("[pubsub] authentication expired");
        return;
      }
      console.log("[pubsub] disconnected, reconnecting in 3s...");
      scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  } catch {
    if (ticketRequestToken === token) {
      ticketRequestToken = null;
      wsToken = null;
      scheduleReconnect();
    }
  }
}

export function usePubSub(eventType?: string, handler?: EventHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    connect();
  }, []);

  useEffect(() => {
    if (!eventType || !handlerRef.current) return;

    const wrappedHandler: EventHandler = (payload) => handlerRef.current?.(payload);

    if (!handlers.has(eventType)) {
      handlers.set(eventType, new Set());
    }
    handlers.get(eventType)!.add(wrappedHandler);

    return () => {
      handlers.get(eventType)?.delete(wrappedHandler);
    };
  }, [eventType]);
}

export function useRealtimeProjects() {
  usePubSub();
}