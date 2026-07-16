import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import styles from './Home.module.css';

// Small CSS dot markers instead of the default leaflet pin (which needs
// bundler-specific asset handling and was rendering broken under Vite).
const ownIcon = L.divIcon({
  className: `leaflet-dot-icon ${styles.ownMarker}`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const personIcon = L.divIcon({
  className: `leaflet-dot-icon ${styles.personMarker}`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

function RecenterOnMove({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, map.getZoom(), { animate: true });
  }, [position, map]);
  return null;
}

export default function Home() {
  const { user } = useAuth();
  const mapRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Цей браузер не підтримує визначення геопозиції.');
      setLoading(false);
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const nextPosition = [pos.coords.latitude, pos.coords.longitude];
        setPosition(nextPosition);
        setError('');
        setLoading(false);

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

        try {
          await api.post('/activities/locations/', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        } catch {
          // location sync is best-effort; the map still works without it
        }
      },
      (err) => {
        setLoading(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Доступ до геопозиції заборонено. Дозволь його в налаштуваннях браузера, щоб зʼявитися на карті.'
            : 'Не вдалося визначити місцезнаходження. Перевір, чи увімкнена геолокація.'
        );
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const nearbyCount = useMemo(() => nearbyUsers.length, [nearbyUsers]);

  const recenterToMe = () => {
    if (position && mapRef.current) {
      mapRef.current.setView(position, mapRef.current.getZoom(), { animate: true });
    }
  };

  return (
    <div className={styles.screen}>
      <header className={styles.topbar}>
        <Link to="/profile" className={styles.greetingBlock}>
          {user?.avatar ? (
            <img src={user.avatar} alt="" className={styles.greetingAvatar} />
          ) : (
            <span className={styles.greetingAvatarFallback}>{user?.username?.slice(0, 1).toUpperCase()}</span>
          )}
          <span className={styles.greeting}>{user?.username}</span>
        </Link>

        <button
          className={styles.recenterButton}
          onClick={recenterToMe}
          type="button"
          disabled={!position}
          aria-label="Показати мою геопозицію"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 2V5M12 19V22M2 12H5M19 12H22"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div className={styles.mapWrap}>
        {loading && (
          <div className={styles.overlayState}>
            <div className={styles.lane} aria-hidden="true">
              <span className={styles.laneDot} />
            </div>
            <p>Визначаємо твою геопозицію…</p>
          </div>
        )}

        {!loading && error && (
          <div className={styles.overlayState}>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && position && (
          <MapContainer ref={mapRef} center={position} zoom={14} zoomControl={false} className={styles.map}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            <Marker position={position} icon={ownIcon} />
            {nearbyUsers.map((person) => (
              <Marker
                key={person.id}
                position={[person.latitude, person.longitude]}
                icon={personIcon}
              />
            ))}
            <RecenterOnMove position={position} />
          </MapContainer>
        )}
      </div>

      <div className={styles.sheet}>
        <div className={styles.sheetHandle} aria-hidden="true" />

        <div className={styles.heroRow}>
          <div>
            <p className={styles.kicker}>Твоя зона активності</p>
            <h1 className={styles.heroTitle}>Люди поруч</h1>
          </div>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeValue}>{nearbyCount}</span>
            <span className={styles.heroBadgeLabel}>поруч</span>
          </div>
        </div>

        <p className={styles.heroText}>
          Радіус 5 км. Приєднуйся до когось поруч або чекай, поки хтось приєднається до тебе.
        </p>

        <div className={styles.userList}>
          {nearbyUsers.length === 0 ? (
            <div className={styles.emptyState}>
              Поки що нікого поруч немає. Спробуй вийти на вулицю — карта оновиться сама.
            </div>
          ) : (
            nearbyUsers.map((person) => (
              <Link className={styles.userCard} key={person.id} to={`/profile/${person.id}`}>
                <div className={styles.userAvatar}>{person.username?.slice(0, 1).toUpperCase()}</div>
                <div className={styles.userMeta}>
                  <div className={styles.userName}>{person.username}</div>
                  <div className={styles.userStatus}>{person.is_online ? 'онлайн' : 'був(ла) нещодавно'}</div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
