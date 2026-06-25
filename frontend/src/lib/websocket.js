import { useEffect, useRef, useState, useCallback } from "react";
import { getWebSocketUrl } from "@/lib/api";

const log = (...args) => console.log("[WS]", ...args);

export function useWebSocket(onEvent) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let stopped = false;
    let reconnectTimer = null;
    let reconnectAttempts = 0;

    function connect() {
      if (stopped) return;
      const url = getWebSocketUrl();
      log("connecting...");
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        log("connected");
        reconnectAttempts = 0;
        setConnected(true);
      };
      ws.onclose = (evt) => {
        log("closed", evt.code, evt.reason || "(no reason)");
        setConnected(false);
        if (!stopped) {
          // Exponential backoff capped at 10s so a dead backend doesn't spam reconnects.
          const delay = Math.min(10000, 1000 * Math.pow(1.5, reconnectAttempts++));
          reconnectTimer = setTimeout(connect, delay);
        }
      };
      ws.onerror = (e) => { log("error", e); try { ws.close(); } catch {} };
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          onEventRef.current?.(data);
        } catch (e) {
          log("failed to parse message", e);
        }
      };
    }
    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { wsRef.current?.close(); } catch {}
    };
  }, []);

  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      log("dropped send, socket not open:", data?.type);
    }
  }, []);

  return { connected, send };
}
