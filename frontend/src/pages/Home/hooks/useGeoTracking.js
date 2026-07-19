import { useEffect, useRef, useState } from 'react';
import api from '../../../api/axios';

/**
 * Watches the browser geolocation and keeps it in sync with the backend.
 * While watching, it also best-effort fetches nearby users and active
 * game zones every time a new position comes in.
 *
 * @param {boolean} isAuthenticated
 * @returns {{
 *   position: [number, number] | null,
 *   error: string,
 *   loading: boolean,
 *   nearbyUsers: Array,
 *   activeZones: Array,
 *   hiddenZoneIds: Set<number>,
 *   setHiddenZoneIds: Function,
 * }}
 */
export default function useGeoTracking(isAuthenticated) {
  const [position, setPosition] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [activeZones, setActiveZones] = useState([]);
  const [hiddenZoneIds, setHiddenZoneIds] = useState(new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const authRef = useRef(isAuthenticated);
  useEffect(() => {
    authRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Цей браузер не підтримує визначення геопозиції.');
      setLoading(false);
      return undefined;
    }

    let didRespond = false;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        didRespond = true;
        const nextPosition = [pos.coords.latitude, pos.coords.longitude];
        setPosition(nextPosition);
        setError('');
        setLoading(false);

        if (!authRef.current) return;

        try {
          const { data } = await api.get('/activities/locations/nearby/', {
            params: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              radius: 5,
            },
          });
          setNearbyUsers(data);
        } catch {
          setNearbyUsers([]);
        }

        // active game zones nearby (best-effort)
        try {
          const { data } = await api.get('/activities/zones/nearby/', {
            params: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              radius: 5,
            },
          });
          const zones = Array.isArray(data) ? data : (data.zones || []);
          const serverHiddenIds = data.hidden_ids || [];
          setActiveZones(zones);
          if (serverHiddenIds.length > 0) {
            setHiddenZoneIds((prev) => {
              const next = new Set(prev);
              serverHiddenIds.forEach((id) => next.add(id));
              return next;
            });
          }
        } catch {
          setActiveZones([]);
        }

        try {
          await api.post('/activities/locations/', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        } catch {
          // ignore
        }
      },
      (err) => {
        didRespond = true;
        setLoading(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Доступ до геопозиції заборонено. Дозволь його в налаштуваннях браузера, щоб зʼявитися на карті.'
            : 'Не вдалося визначити місцезнаходження. Перевір, чи увімкнена геолокація.'
        );
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    const fallback = setTimeout(() => {
      if (!didRespond) {
        setLoading(false);
        setError('Не вдалося швидко визначити місцезнаходження. Спробуйте оновити сторінку або дозволити геолокацію.');
      }
    }, 12000);

    return () => {
      clearTimeout(fallback);
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    position,
    error,
    loading,
    nearbyUsers,
    activeZones,
    setActiveZones,
    hiddenZoneIds,
    setHiddenZoneIds,
  };
}
