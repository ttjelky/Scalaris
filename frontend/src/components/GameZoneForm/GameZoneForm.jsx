import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import api from '../../api/axios';
import { getFriends } from '../../api/friends';
import styles from './GameZoneForm.module.css';

const MIN_RADIUS = 20;
const MAX_RADIUS = 500;
const DEFAULT_RADIUS = 80;

function ErrorIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

export default function GameZoneForm({ initialPosition, nearbyUsers = [], onCancel, onCreated }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [isFriendsOnly, setIsFriendsOnly] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [latLng, setLatLng] = useState(initialPosition || null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState(null);
  const [clientErrors, setClientErrors] = useState({});

  const [friends, setFriends] = useState([]);
  const [participantFilter, setParticipantFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    getFriends()
      .then(({ data }) => {
        if (!cancelled) {
          setFriends(Array.isArray(data) ? data : data.results || []);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const friendIdSet = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  const displayedUsers = participantFilter === 'friends'
    ? nearbyUsers.filter((u) => friendIdSet.has(u.id))
    : nearbyUsers;

  const updateCircle = (pos, r) => {
    if (!mapRef.current) return;
    if (circleRef.current) {
      circleRef.current.setLatLng(pos);
      circleRef.current.setRadius(r);
    } else {
      circleRef.current = L.circle(pos, {
        radius: r,
        color: '#c6ff3d',
        fillColor: '#c6ff3d',
        fillOpacity: 0.18,
        weight: 2,
      }).addTo(mapRef.current);
    }
  };

  const placeMarker = (p) => {
    if (!mapRef.current) return;
    if (markerRef.current) {
      markerRef.current.setLatLng(p);
    } else {
      markerRef.current = L.marker(p, { draggable: true }).addTo(mapRef.current);
      markerRef.current.on('dragend', (e) => {
        const q = e.target.getLatLng();
        const pos = [q.lat, q.lng];
        setLatLng(pos);
        updateCircle(pos, radius);
      });
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      center: initialPosition || [50.4501, 30.5234],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(mapRef.current);

    if (initialPosition) {
      placeMarker(initialPosition);
      updateCircle(initialPosition, radius);
    }

    const onMapClick = (e) => {
      const { lat, lng } = e.latlng;
      const pos = [lat, lng];
      setLatLng(pos);
      placeMarker(pos);
      updateCircle(pos, radius);
      setClientErrors((s) => ({ ...s, location: undefined }));
    };
    mapRef.current.on('click', onMapClick);

    const resizeTimer = setTimeout(() => {
      mapRef.current && mapRef.current.invalidateSize();
    }, 360);

    return () => {
      clearTimeout(resizeTimer);
      try {
        mapRef.current.off();
        mapRef.current.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRadiusChange = (val) => {
    const r = Number(val);
    setRadius(r);
    if (latLng) updateCircle(latLng, r);
  };

  const toggleParticipant = (id) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setClientErrors((s) => ({ ...s, location: 'Геолокація недоступна в цьому браузері.' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = [pos.coords.latitude, pos.coords.longitude];
        setLatLng(p);
        if (mapRef.current) {
          mapRef.current.setView(p, 15);
          placeMarker(p);
          updateCircle(p, radius);
        }
        setClientErrors((s) => ({ ...s, location: undefined }));
      },
      () => {
        setClientErrors((s) => ({ ...s, location: 'Не вдалося отримати поточну позицію.' }));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const validate = () => {
    const errs = {};
    if (!latLng) errs.location = 'Постав мітку на карті.';
    if (!title.trim()) errs.title = 'Введіть назву зони.';
    setClientErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        category: 'zone',
        latitude: latLng[0],
        longitude: latLng[1],
        started_at: new Date().toISOString(),
        participant_ids: selectedParticipants,
        geofence_radius_m: radius,
        is_friends_only: isFriendsOnly,
      };

      const { data } = await api.post('/activities/', body);
      if (onCreated) onCreated(data);
    } catch (err) {
      if (err?.response?.data) {
        setErrors(err.response.data);
      } else {
        setErrors({ non_field_errors: ['Неочікувана помилка. Спробуйте пізніше.'] });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.field}>
        <label>Назва зони *</label>
        <input
          type="text"
          placeholder="Напр. Баскетбольне поле"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setClientErrors((s) => ({ ...s, title: undefined })); }}
          maxLength={120}
        />
        {clientErrors.title && <div className={styles.fieldError}><ErrorIcon />{clientErrors.title}</div>}
      </div>

      <div className={styles.field}>
        <label>Опис</label>
        <textarea
          placeholder="Що тут відбувається?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={styles.textarea}
        />
      </div>

      <div className={styles.field}>
        <label>Місце на карті *</label>
        <div className={styles.mapPreview} ref={mapContainerRef} />
        <div className={styles.mapActions}>
          <button type="button" className={styles.locationBtn} onClick={handleUseMyLocation}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path d="M12 2V5M12 19V22M2 12H5M19 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Моя позиція
          </button>
          {latLng && (
            <span className={styles.coordsHint}>
              {latLng[0].toFixed(5)}, {latLng[1].toFixed(5)}
            </span>
          )}
        </div>
        {clientErrors.location && <div className={styles.fieldError}><ErrorIcon />{clientErrors.location}</div>}
      </div>

      <div className={styles.field}>
        <label>Радіус: {radius} м</label>
        <input
          type="range"
          min={MIN_RADIUS}
          max={MAX_RADIUS}
          step={10}
          value={radius}
          onChange={(e) => handleRadiusChange(e.target.value)}
          className={styles.slider}
        />
        <div className={styles.radiusLabels}>
          <span>{MIN_RADIUS} м</span>
          <span>{MAX_RADIUS} м</span>
        </div>
      </div>

      <div className={styles.field}>
        <label>Видимість</label>
        <button
          type="button"
          className={`${styles.toggleBtn} ${isFriendsOnly ? styles.toggleBtnActive : ''}`}
          onClick={() => setIsFriendsOnly((v) => !v)}
        >
          {isFriendsOnly ? 'Тільки друзі' : 'Для всіх'}
        </button>
      </div>

      <div className={styles.field}>
        <label>Запросити учасників (необов'язково)</label>
        <div className={styles.filterToggle}>
          <button
            type="button"
            className={`${styles.filterBtn} ${participantFilter === 'all' ? styles.filterBtnActive : ''}`}
            onClick={() => setParticipantFilter('all')}
          >
            Усі
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${participantFilter === 'friends' ? styles.filterBtnActive : ''}`}
            onClick={() => setParticipantFilter('friends')}
          >
            Друзі
          </button>
        </div>
        <div className={styles.participantsList}>
          {displayedUsers.length === 0 && (
            <div className={styles.empty}>
              {participantFilter === 'friends' ? 'Немає друзів поруч' : 'Немає користувачів поруч'}
            </div>
          )}
          {displayedUsers.map((u) => {
            const active = selectedParticipants.includes(u.id);
            return (
              <button
                type="button"
                key={u.id}
                className={`${styles.participant} ${active ? styles.participantActive : ''}`}
                onClick={() => toggleParticipant(u.id)}
                aria-pressed={active}
              >
                {u.avatar ? (
                  <img src={u.avatar} alt="" className={styles.participantAvatarImg} />
                ) : (
                  <span className={styles.participantAvatar}>{u.username?.slice(0, 1).toUpperCase()}</span>
                )}
                {u.username}
              </button>
            );
          })}
        </div>
      </div>

      {errors && (
        <div className={styles.serverErrors}>
          {typeof errors === 'string'
            ? <div>{errors}</div>
            : Object.entries(errors).map(([k, v]) => (
                <div key={k}><strong>{k}:</strong> {Array.isArray(v) ? v.join('; ') : String(v)}</div>
              ))}
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" onClick={onCancel} className={styles.cancelBtn}>Скасувати</button>
        <button type="submit" className={styles.submitBtn} disabled={submitting}>
          {submitting ? 'Створюємо…' : 'Створити зону'}
        </button>
      </div>
    </form>
  );
}
