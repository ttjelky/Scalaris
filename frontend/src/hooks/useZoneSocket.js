import { useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../api/axios';

/**
 * WebSocket hook for real-time zone map updates (deletions).
 *
 * @returns {{ deletedZoneIds: Set<number> }}
 */
export default function useZoneSocket() {
  const [deletedZoneIds, setDeletedZoneIds] = useState(new Set());
  const ws = useRef(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return undefined;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/api/ws/zones/?token=${encodeURIComponent(token)}`;

    try {
      const socket = new WebSocket(url);
      ws.current = socket;

      socket.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'zone_deleted' && data.activity_id) {
            setDeletedZoneIds((prev) => new Set([...prev, data.activity_id]));
          }
        } catch {
          // ignore parse errors
        }
      };

      socket.onclose = () => { ws.current = null; };
      socket.onerror = () => {};
    } catch {}

    return () => {
      if (ws.current) {
        try { ws.current.close(); } catch {}
        ws.current = null;
      }
    };
  }, []);

  return { deletedZoneIds };
}
