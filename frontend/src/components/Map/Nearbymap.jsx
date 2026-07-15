import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useGeolocation } from '../../hooks/useGeolocation';
import { getNearbyUsers, sendInvitation } from '../../api/geo';
import styles from './NearbyMap.module.css';

const NEARBY_POLL_MS = 15_000;
const NEARBY_RADIUS_M = 1000;

/** Іконка-крапка поточного користувача (пульсуюча). */
const selfIcon = L.divIcon({
  className: '',
  html: `<div class="${styles.selfMarker}"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/** Іконка іншого користувача — кружечок із першою літерою імені. */
function makeUserIcon(username) {
  const letter = (username || '?').trim().charAt(0).toUpperCase();
  return L.divIcon({
    className: '',
    html: `<div class="${styles.userMarker}">${letter}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

/** Плавно перецентровує карту, коли позиція користувача змінюється вперше. */
function RecenterOnFirstFix({ position }) {
  const map = useMap();
  const centeredRef = useRef(false);

  useEffect(() => {
    if (position && !centeredRef.current) {
      centeredRef.current = true;
      map.setView([position.lat, position.lng], 16, { animate: true });
    }
  }, [position, map]);

  return null;
}

function distanceLabel(meters) {
  if (meters == null) return '';
  if (meters < 1000) return `${Math.round(meters)} м від тебе`;
  return `${(meters / 1000).toFixed(1)} км від тебе`;
}

export default function NearbyMap() {
  const { position, status, retry } = useGeolocation();
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [invitedIds, setInvitedIds] = useState(() => new Set());
  const [toast, setToast] = useState(null);

  // Періодично тягнемо активних людей поблизу, щойно є перша позиція
  useEffect(() => {
    if (!position) return undefined;

    let cancelled = false;

    const fetchNearby = async () => {
      try {
        const data = await getNearbyUsers({
          lat: position.lat,
          lng: position.lng,
          radius: NEARBY_RADIUS_M,
        });
        if (!cancelled) setNearbyUsers(Array.isArray(data) ? data : data?.results || []);
      } catch {
        // тихо ігноруємо — спробуємо ще раз наступним тіком
      }
    };

    fetchNearby();
    const intervalId = setInterval(fetchNearby, NEARBY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [position?.lat, position?.lng]);

  const handleInvite = async (userId) => {
    setInvitedIds((prev) => new Set(prev).add(userId));
    try {
      await sendInvitation(userId);
      setToast('Запрошення надіслано ✨');
    } catch {
      setToast('Не вдалося надіслати запрошення');
      setInvitedIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
    setTimeout(() => setToast(null), 2800);
  };

  const initialCenter = useMemo(
    () => (position ? [position.lat, position.lng] : [50.4501, 30.5234]), // Київ як дефолт, поки нема фіксу
    // навмисно без position у deps — це лише початкове значення MapContainer
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className={styles.wrapper}>
      <MapContainer
        center={initialCenter}
        zoom={14}
        zoomControl={false}
        className={styles.map}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RecenterOnFirstFix position={position} />

        {position && (
          <Marker position={[position.lat, position.lng]} icon={selfIcon} />
        )}

        {nearbyUsers.map((u) => (
          <Marker
            key={u.id}
            position={[u.lat, u.lng]}
            icon={makeUserIcon(u.username)}
          >
            <Popup closeButton={false} offset={[0, -6]}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardAvatar}>
                    {(u.username || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className={styles.cardName}>{u.username}</p>
                    <p className={styles.cardDistance}>{distanceLabel(u.distance)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.inviteButton}
                  disabled={invitedIds.has(u.id)}
                  onClick={() => handleInvite(u.id)}
                >
                  {invitedIds.has(u.id) ? 'Запрошено' : 'Запросити'}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {(status === 'locating' || status === 'idle') && (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <div className={styles.spinner} />
            <h2 className={styles.overlayTitle}>Шукаємо тебе на карті</h2>
            <p className={styles.overlayText}>
              Дозволь доступ до геолокації в браузері, щоб побачити людей поблизу.
            </p>
          </div>
        </div>
      )}

      {status === 'denied' && (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <h2 className={styles.overlayTitle}>Немає доступу до геолокації</h2>
            <p className={styles.overlayText}>
              Без геолокації ми не можемо показати карту з людьми поблизу. Дозволь
              доступ у налаштуваннях браузера для цього сайту й спробуй ще раз.
            </p>
            <button type="button" className={styles.overlayButton} onClick={retry}>
              Спробувати знову
            </button>
          </div>
        </div>
      )}

      {status === 'unsupported' && (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <h2 className={styles.overlayTitle}>Геолокація не підтримується</h2>
            <p className={styles.overlayText}>
              Твій браузер не підтримує геолокацію. Спробуй відкрити сайт у іншому
              браузері.
            </p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <h2 className={styles.overlayTitle}>Не вдалось визначити позицію</h2>
            <p className={styles.overlayText}>
              Перевір, чи увімкнена геолокація на пристрої, і спробуй ще раз.
            </p>
            <button type="button" className={styles.overlayButton} onClick={retry}>
              Спробувати знову
            </button>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}