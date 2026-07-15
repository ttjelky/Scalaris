import { useCallback, useEffect, useRef, useState } from 'react';
import { createSocket } from '../api/socket';

// Набагато частіше за колишній REST-поллінг (12с) — бо тепер це live-канал
const SEND_INTERVAL_MS = 3000;

/**
 * Тримає live WebSocket-з'єднання з /ws/location/:
 *  - надсилає позицію користувача (throttled раз на SEND_INTERVAL_MS)
 *  - приймає snapshot / точкові апдейти людей поблизу
 *  - дозволяє надіслати запрошення через той самий канал
 *
 * Очікуваний протокол повідомлень від сервера:
 *   { type: 'nearby_snapshot', users: [{id, username, lat, lng, distance}, ...] }
 *   { type: 'user_update', user: {id, username, lat, lng, distance} }
 *   { type: 'user_left', user_id }
 *
 * Повідомлення від клієнта на сервер:
 *   { type: 'update_location', lat, lng }
 *   { type: 'send_invitation', target_user }
 */
export function useLocationSocket(position) {
  const usersRef = useRef(new Map());
  const socketRef = useRef(null);
  const lastSentAt = useRef(0);
  const [, forceRender] = useState(0);
  const [status, setStatus] = useState('connecting'); // connecting | live | reconnecting | offline

  const bump = () => forceRender((v) => v + 1);

  useEffect(() => {
    const socket = createSocket('/ws/location/', {
      onStatusChange: setStatus,
      onMessage: (msg) => {
        switch (msg.type) {
          case 'nearby_snapshot': {
            const next = new Map();
            (msg.users || []).forEach((u) => next.set(u.id, u));
            usersRef.current = next;
            bump();
            break;
          }
          case 'user_update': {
            usersRef.current.set(msg.user.id, msg.user);
            bump();
            break;
          }
          case 'user_left': {
            usersRef.current.delete(msg.user_id);
            bump();
            break;
          }
          default:
            break; // невідомі типи (майбутній чат тощо) ігноруємо тут
        }
      },
    });

    socketRef.current = socket;
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  // Шлемо свіжу позицію одразу, як вона змінилась (з throttle)
  useEffect(() => {
    if (!position) return;
    const now = Date.now();
    if (now - lastSentAt.current < SEND_INTERVAL_MS) return;

    const sent = socketRef.current?.send({
      type: 'update_location',
      lat: position.lat,
      lng: position.lng,
    });
    if (sent) lastSentAt.current = now;
  }, [position]);

  const invite = useCallback((targetUserId) => {
    const sent = socketRef.current?.send({
      type: 'send_invitation',
      target_user: targetUserId,
    });
    return sent
      ? Promise.resolve()
      : Promise.reject(new Error('Немає live-з’єднання із сервером'));
  }, []);

  return {
    nearbyUsers: Array.from(usersRef.current.values()),
    status,
    invite,
  };
}