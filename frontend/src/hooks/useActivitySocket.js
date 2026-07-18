import { useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../api/axios';

/**
 * WebSocket hook for real-time activity participant status updates.
 * Replaces the 6-second polling interval in Home.jsx for ongoing activities.
 *
 * @param {number|string|null} activityId - The activity to subscribe to, or null to disconnect.
 * @returns {{ participants: Array, liveStatus: string, cancelled: boolean }}
 */
export default function useActivitySocket(activityId) {
  const [participants, setParticipants] = useState([]);
  const [liveStatus, setLiveStatus] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    if (!activityId) return;

    let reconnectTimer = null;
    let active = true;

    function connect() {
      if (!active) return;

      const token = getAccessToken();
      if (!token) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const url = `${protocol}//${host}/api/ws/activity/${activityId}/?token=${token}`;

      try {
        const socket = new WebSocket(url);
        ws.current = socket;

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
          ws.current = null;
          if (active) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch {
        // WebSocket construction failed
      }
    }

    connect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws.current) ws.current.close();
    };
  }, [activityId]);

  return { participants, liveStatus, cancelled };
}
