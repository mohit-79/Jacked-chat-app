import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { getClerkToken } from "@/lib/api";

const log = (...args) => console.log("[Socket.IO]", ...args);

export function useWebSocket(onEvent) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let stopped = false;
    let socket = null;

    async function initSocket() {
      const token = await getClerkToken();
      if (stopped) return;

      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      log("Connecting to Socket.IO backend:", backendUrl);

      // Initialize Socket.IO connection
      socket = io(backendUrl, {
        query: { token: token || "" },
        transports: ["websocket"], // Enforce raw WebSocket transport for speed
        autoConnect: true
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        log("Connected successfully to real-time engine.");
        setConnected(true);
      });

      socket.on("disconnect", () => {
        log("Disconnected from real-time engine.");
        setConnected(false);
      });

      // Listen for message events broadcasted from the Express backend
      socket.on("message", (data) => {
        log("Incoming socket message:", data?.type);
        onEventRef.current?.(data);
      });

      socket.on("connect_error", (err) => {
        log("Socket connection error:", err.message);
      });
    }

    initSocket();

    return () => {
      stopped = true;
      if (socket) {
        log("Disconnecting socket connection...");
        socket.disconnect();
      }
    };
  }, []);

  // Send function wrapper that mimics raw websocket sends, emitting specialized events based on payload type.
  const send = useCallback((data) => {
    const socket = socketRef.current;
    if (socket && socket.connected) {
      if (data && data.type) {
        log("Emitting socket event:", data.type);
        socket.emit(data.type, data);
      } else {
        log("Emitting generic message");
        socket.emit("message", data);
      }
    } else {
      log("Dropped emit, socket not connected:", data?.type);
    }
  }, []);

  return { connected, send };
}
