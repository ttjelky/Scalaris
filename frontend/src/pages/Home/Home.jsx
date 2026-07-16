import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
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

// Drag distance (px) needed to trigger a state change when releasing the sheet.
const COLLAPSE_THRESHOLD = 60;
const EXPAND_THRESHOLD = 40;

// Nicknames only show once you're this many zoom levels away from max zoom
// (i.e. reasonably close in) — otherwise crowded areas turn into a wall of text.
const NICKNAME_ZOOM_OFFSET = 3;

function RecenterOnMove({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, map.getZoom(), { animate: true });
  }, [position, map]);
  return null;
}

function ZoomWatcher({ onZoomChange }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom(), map.getMaxZoom()),
  });
  useEffect(() => {
    onZoomChange(map.getZoom(), map.getMaxZoom());
  }, [map, onZoomChange]);
  return null;
}

export default function Home() {
  const { user, updateUser } = useAuth();
  const mapRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [showNicknames, setShowNicknames] = useState(false);

  const handleZoomChange = useCallback((zoom, maxZoom) => {
    setShowNicknames(zoom >= maxZoom - NICKNAME_ZOOM_OFFSET);
  }, []);

  // --- Draggable bottom sheet state -------------------------------------
  // Only two positions now: 'collapsed' (small badge) and 'expanded' (panel
  // covering more than half the screen). Toggled by dragging the handle OR
  // tapping the header (handle + hero row).
  //
  // The drag itself is intentionally kept OUT of React state: updating
  // state on every pointermove forced a re-render (and a recompute of the
  // sheet's backdrop-filter blur) on every single frame, which is what made
  // dragging feel heavy/laggy. Instead we write the transform straight to
  // the DOM node via a ref, throttled to one update per animation frame.
  // React only steps back in once, when the finger lifts.
  const [sheetState, setSheetState] = useState('collapsed');
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef(null);
  const dragStartY = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const rafRef = useRef(null);
  const hasDragged = useRef(false);

  const applyDragTransform = () => {
    rafRef.current = null;
    if (sheetRef.current) {
      sheetRef.current.style.transform = dragYRef.current
        ? `translateY(${dragYRef.current}px)`
        : '';
    }
  };

  const handlePointerDown = (e) => {
    dragStartY.current = e.clientY;
    dragYRef.current = 0;
    hasDragged.current = false;
    isDraggingRef.current = true;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientY - dragStartY.current;
    if (Math.abs(delta) > 4) hasDragged.current = true;

    // Collapsed can only be dragged up (towards expanded), expanded can
    // only be dragged down (towards collapsed) — there's nowhere else to go.
    const clamped = sheetState === 'collapsed' ? Math.min(0, delta) : Math.max(0, delta);

    dragYRef.current = clamped;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(applyDragTransform);
    }
  };

  const finishDrag = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sheetRef.current) sheetRef.current.style.transform = '';

    const dragY = dragYRef.current;
    dragYRef.current = 0;

    if (sheetState === 'expanded' && dragY > COLLAPSE_THRESHOLD) {
      setSheetState('collapsed');
    } else if (sheetState === 'collapsed' && dragY < -EXPAND_THRESHOLD) {
      setSheetState('expanded');
    }
  };

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const handleHeaderClick = () => {
    // A tap (not a drag) on the handle/hero row toggles the sheet.
    if (hasDragged.current) return;
    setSheetState((prev) => (prev === 'collapsed' ? 'expanded' : 'collapsed'));
  };
  // ------------------------------------------------------------------------

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

  const visibleOnMap = user?.is_visible_on_map ?? true;

  const toggleVisibility = async () => {
    const next = !visibleOnMap;
    updateUser({ is_visible_on_map: next }); // optimistic
    setTogglingVisibility(true);
    try {
      await api.patch('/users/me/', { is_visible_on_map: next });
    } catch {
      updateUser({ is_visible_on_map: !next }); // revert on failure
    } finally {
      setTogglingVisibility(false);
    }
  };
  const sheetClassName = [
    styles.sheet,
    sheetState === 'collapsed' && styles.sheetCollapsed,
    isDragging && styles.sheetDragging,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.screen}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <Link to="/profile" className={styles.greetingBlock}>
            {user?.avatar ? (
              <img src={user.avatar} alt="" className={styles.greetingAvatar} />
            ) : (
              <span className={styles.greetingAvatarFallback}>{user?.username?.slice(0, 1).toUpperCase()}</span>
            )}
            <span className={styles.greeting}>{user?.username}</span>
          </Link>

          <button
            className={styles.visibilityButton}
            onClick={toggleVisibility}
            type="button"
            disabled={togglingVisibility}
            aria-pressed={visibleOnMap}
            aria-label={visibleOnMap ? 'Сховати мене з карти' : 'Показати мене на карті'}
            title={visibleOnMap ? 'Видимий на карті' : 'Прихований з карти'}
          >
            {visibleOnMap ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M1 12C1 12 5 5 12 5C19 5 23 12 23 12C23 12 19 19 12 19C5 19 1 12 1 12Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M17.94 17.94C16.23 19.24 14.24 20 12 20C5 20 1 13 1 13C2.24 10.72 3.9 8.87 5.76 7.53M9.9 4.24C10.58 4.09 11.28 4 12 4C19 4 23 12 23 12C22.39 13.15 21.62 14.29 20.72 15.35M14.12 14.12C13.63 14.65 12.86 15 12 15C10.34 15 9 13.66 9 12C9 11.14 9.35 10.37 9.88 9.88"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M1 1L23 23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>

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
              maxZoom={19}
            />
            <Marker position={position} icon={ownIcon} />
            {nearbyUsers.map((person) => (
              <Marker
                key={person.id}
                position={[person.latitude, person.longitude]}
                icon={personIcon}
              >
                {showNicknames && (
                  <Tooltip
                    className={styles.markerLabel}
                    direction="top"
                    offset={[0, -10]}
                    permanent
                    interactive={false}
                  >
                    {person.username}
                  </Tooltip>
                )}
              </Marker>
            ))}
            <RecenterOnMove position={position} />
            <ZoomWatcher onZoomChange={handleZoomChange} />
          </MapContainer>
        )}
      </div>

      <div className={sheetClassName} ref={sheetRef}>
        <div
          className={styles.sheetHeader}
          role="button"
          tabIndex={0}
          aria-expanded={sheetState === 'expanded'}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onClick={handleHeaderClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleHeaderClick();
            }
          }}
        >
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
