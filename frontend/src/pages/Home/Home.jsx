import { useEffect, useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icon references image paths that don't resolve
// under Vite's bundler by default — point them at the bundled asset URLs.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import { useAuth } from '../../context/AuthContext';
import styles from './Home.module.css';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/** Keeps the map centered as `position` updates, without remounting it. */
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Цей браузер не підтримує визначення геопозиції.');
      setLoading(false);
      return undefined;
    }

    // watchPosition (not getCurrentPosition) so the dot keeps following the
    // user if they move, not just a one-time fix on load.
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        setError('');
        setLoading(false);
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

  return (
    <div className={styles.screen}>
      <header className={styles.topbar}>
        <span className={styles.greeting}>Привіт, {user?.username}</span>
        <button className={styles.logoutButton} onClick={logout} type="button">
          Вийти
        </button>
      </header>

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
          <MapContainer
            center={position}
            zoom={15}
            zoomControl={false}
            className={styles.map}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <Marker position={position} />
            <Circle
              center={position}
              radius={40}
              pathOptions={{ color: '#c6ff3d', fillColor: '#c6ff3d', fillOpacity: 0.15, weight: 1 }}
            />
            <RecenterOnMove position={position} />
          </MapContainer>
        )}
      </div>
    </div>
  );
}
