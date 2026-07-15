import { useEffect, useRef, useState } from 'react';

/**
 * Стежить за позицією користувача в браузері (watchPosition).
 * Саму відправку позиції на сервер тепер робить useLocationSocket —
 * цей хук відповідає лише за доступ до GPS і стан дозволів.
 *
 * Повертає:
 *  - position: { lat, lng } | null — поточна позиція
 *  - status: 'idle' | 'locating' | 'ready' | 'denied' | 'unsupported' | 'error'
 *  - retry(): заново запросити дозвіл
 */
export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState('idle');
  const watchIdRef = useRef(null);

  const start = () => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }

    setStatus('locating');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setStatus('ready');
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 10_000,
      }
    );
  };

  useEffect(() => {
    start();
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    start();
  };

  return { position, status, retry };
}