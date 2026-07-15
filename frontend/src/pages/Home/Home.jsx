import { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import styles from './Home.module.css';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function RecenterOnMove({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, map.getZoom(), { animate: true });
  }, [position, map]);
  return null;
}

export default function Home() {
  const { user, logout } = useAuth();
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

  return (
    <div className={styles.screen}>
      <header className={styles.topbar}>
        <div className={styles.greetingBlock}>
          <span className={styles.eyebrow}>Live map</span>
          <div className={styles.greeting}>Привіт, {user?.username}</div>
        </div>
        <button className={styles.logoutButton} onClick={logout} type="button">
          Вийти
        </button>
      </header>

      <div className={styles.heroCard}>
        <div>
          <p className={styles.kicker}>Твоя зона активності</p>
          <h1 className={styles.heroTitle}>Зустрічаєш людей у радіусі 5 км</h1>
          <p className={styles.heroText}>Бачиш, хто поруч, і зберігаєш момент бігу або прогулянки прямо на карті.</p>
        </div>
        <div className={styles.heroStat}>
          <span className={styles.heroStatValue}>{nearbyCount}</span>
          <span className={styles.heroStatLabel}>поруч</span>
        </div>
      </div>

      <div className={styles.mapWrap}>
        {loading && (
          <div className={styles.overlayState}>
            <span className={styles.spinner} aria-hidden="true" />
            <p>Визначаємо твою геопозицію…</p>
          </div>
        )}

        {!loading && error && (
          <div className={styles.overlayState}>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && position && (
          <>
            <MapContainer center={position} zoom={14} zoomControl={false} className={styles.map}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <Marker position={position} />
              <Circle
                center={position}
                radius={4000}
                pathOptions={{ color: '#7dd3fc', fillColor: '#38bdf8', fillOpacity: 0.12, weight: 1 }}
              />
              {nearbyUsers.map((person) => (
                <Marker key={person.id} position={[person.latitude, person.longitude]} />
              ))}
              <RecenterOnMove position={position} />
            </MapContainer>

            <div className={styles.sidePanel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelTitle}>Поруч зараз</p>
                  <p className={styles.panelSubtitle}>Користувачі в радіусі 5 км</p>
                </div>
                <span className={styles.panelBadge}>{nearbyCount}</span>
              </div>
              <div className={styles.userList}>
                {nearbyUsers.length === 0 ? (
                  <div className={styles.emptyState}>Поки що нікого поруч немає. Розкрий зону активності.</div>
                ) : (
                  nearbyUsers.map((person) => (
                    <div className={styles.userCard} key={person.id}>
                      <div className={styles.userAvatar}>{person.username?.slice(0, 1).toUpperCase()}</div>
                      <div className={styles.userMeta}>
                        <div className={styles.userName}>{person.username}</div>
                        <div className={styles.userStatus}>{person.is_online ? 'online' : 'last seen'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
