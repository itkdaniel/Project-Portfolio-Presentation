import { useEffect, useRef, useCallback } from "react";
import { queryClient } from "./queryClient";

type EventHandler = (payload: any) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const handlers = new Map<string, Set<EventHandler>>();

function getWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function connect() {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    console.log("[pubsub] connected");
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
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

  ws.onclose = () => {
    console.log("[pubsub] disconnected, reconnecting in 3s...");
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = () => {
    ws?.close();
  };
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