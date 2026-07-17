import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../api/axios';

/**
 * WebSocket hook for real-time notification count updates.
 * Replaces the 30-second polling interval in Navbar.
 *
 * @returns {{ notifCount: number, refreshCount: () => void }}
 */
export default function useNotifications() {
  const [notifCount, setNotifCount] = useState(0);
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectDelay = useRef(1000);
  const connectRef = useRef(null);

  useEffect(() => {
    let active = true;

    function connect() {
      if (!active) return;

      const token = getAccessToken();
      if (!token) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const url = `${protocol}//${host}/api/ws/notifications/?token=${token}`;

      try {
        const socket = new WebSocket(url);
        ws.current = socket;

        socket.onopen = () => {
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
          ws.current = null;
          if (e.code !== 4001 && active) {
            reconnectTimer.current = setTimeout(() => {
              reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
              connect();
            }, reconnectDelay.current);
          }
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch {
        // WebSocket construction failed
      }
    }

    connectRef.current = connect;
    connect();

    return () => {
      active = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (ws.current) ws.current.close();
    };
  }, []);

  /** Manually request a count refresh from the server. */
  const refreshCount = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'get_count' }));
    }
  }, []);

  return { notifCount, refreshCount };
}
