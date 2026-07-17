import { useEffect, useRef, useState } from 'react';
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
 * WebSocket hook for real-time activity participant status updates.
 *
 * @param {number|string|null} activityId - The activity to subscribe to, or null to disconnect.
 * @returns {{ participants: Array, liveStatus: string, cancelled: boolean }}
 */
export default function useActivitySocket(activityId) {
  const [participants, setParticipants] = useState([]);
  const [liveStatus, setLiveStatus] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const ws = useRef(null);
  const connectionId = useRef(0);

  useEffect(() => {
    if (!activityId) return undefined;

    let active = true;
    let reconnectTimer = null;
    const currentConnectionId = ++connectionId.current;

    function connect() {
      if (!active || currentConnectionId !== connectionId.current) return;

      const token = getAccessToken();
      if (!token) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const url = `${protocol}//${host}/api/ws/activity/${activityId}/?token=${encodeURIComponent(token)}`;

      try {
        const socket = new WebSocket(url);
        ws.current = socket;

        socket.onopen = () => {
          if (!active || currentConnectionId !== connectionId.current) {
            closeSocketSafely(socket);
          }
        };

        socket.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);

            if (data.type === 'activity_state') {
              setParticipants(data.participants || []);
              setLiveStatus(data.live_status || '');
              setCancelled(false);
            } else if (data.type === 'participant_update') {
              setParticipants((prev) => {
                const idx = prev.findIndex((p) => p.id === data.participant?.id);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = data.participant;
                  return next;
                }
                return [...prev, data.participant];
              });
              if (data.activity_status) setLiveStatus(data.activity_status);
            } else if (data.type === 'activity_cancelled') {
              setCancelled(true);
              setLiveStatus('cancelled');
            }
          } catch {
            // ignore parse errors
          }
        };

        socket.onclose = () => {
          if (socket === ws.current) ws.current = null;
          if (!active || currentConnectionId !== connectionId.current) return;
          reconnectTimer = setTimeout(connect, 3000);
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
      if (reconnectTimer) clearTimeout(reconnectTimer);
      closeSocketSafely(ws.current);
      ws.current = null;
    };
  }, [activityId]);

  return { participants, liveStatus, cancelled };
}
