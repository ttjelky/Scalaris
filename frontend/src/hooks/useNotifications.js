import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../api/axios';

function closeSocketSafely(socket) {
  if (!socket) return;
  socket.onclose = null;
  socket.onerror = null;
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.onopen = () => socket.close();
    return;
  }
  if (socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
}

/**
 * WebSocket hook for real-time notification count updates.
 *
 * @param {boolean} enabled - Connect only when the user session is ready.
 * @returns {{ notifCount: number, refreshCount: () => void }}
 */
export default function useNotifications(enabled = false) {
  const [notifCount, setNotifCount] = useState(0);
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectDelay = useRef(1000);
  const connectionId = useRef(0);

  useEffect(() => {
    if (!enabled) {
      connectionId.current += 1;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      closeSocketSafely(ws.current);
      ws.current = null;
      return undefined;
    }

    let active = true;
    const currentConnectionId = ++connectionId.current;

    function connect() {
      if (!active || currentConnectionId !== connectionId.current) return;

      const token = getAccessToken();
      if (!token) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const url = `${protocol}//${host}/api/ws/notifications/?token=${encodeURIComponent(token)}`;

      try {
        const socket = new WebSocket(url);
        ws.current = socket;

        socket.onopen = () => {
          if (!active || currentConnectionId !== connectionId.current) {
            closeSocketSafely(socket);
            return;
          }
          reconnectDelay.current = 1000;
        };

        socket.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'notification_count') {
              setNotifCount(data.count || 0);
            }
          } catch {
            // ignore malformed messages
          }
        };

        socket.onclose = (e) => {
          if (socket === ws.current) ws.current = null;
          if (!active || currentConnectionId !== connectionId.current) return;
          // code 4001 = auth failure — don't retry
          if (e.code === 4001) return;
          reconnectTimer.current = setTimeout(() => {
            reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
            connect();
          }, reconnectDelay.current);
        };

        socket.onerror = () => {
          // onclose handles cleanup/reconnect
        };
      } catch {
        // WebSocket construction failed
      }
    }

    connect();

    return () => {
      active = false;
      connectionId.current += 1;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      closeSocketSafely(ws.current);
      ws.current = null;
    };
  }, [enabled]);

  /** Manually request a count refresh from the server. */
  const refreshCount = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'get_count' }));
    }
  }, []);

  return { notifCount, refreshCount };
}
