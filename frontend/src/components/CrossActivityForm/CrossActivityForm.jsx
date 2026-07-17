import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import api from '../../api/axios';
import { getFriends } from '../../api/friends';
import styles from './CrossActivityForm.module.css';

function ErrorIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

const CHECKPOINT_COLORS = [
  '#c6ff3d', '#ff6b6b', '#4ecdc4', '#a78bfa',
  '#f59e0b', '#ec4899', '#10b981', '#6366f1',
];

export default function CrossActivityForm({ initialPosition, nearbyUsers = [], onCancel, onCreated }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);

  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [noTimeLimit, setNoTimeLimit] = useState(false);
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

  const placeCheckpointMarker = useCallback((cp, index) => {
    if (!mapRef.current) return null;
    const color = CHECKPOINT_COLORS[index % CHECKPOINT_COLORS.length];
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:28px;height:28px;border-radius:50%;
        background:${color};border:3px solid #fff;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:12px;color:#0b0b0c;
      ">${index + 1}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const marker = L.marker([cp.latitude, cp.longitude], { draggable: true, icon }).addTo(mapRef.current);
    marker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      setCheckpoints((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], latitude: pos.lat, longitude: pos.lng };
        return next;
      });
    });
    return marker;
  }, []);

  const updatePolyline = useCallback((cps) => {
    if (!mapRef.current) return;
    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
    }
    if (cps.length >= 2) {
      polylineRef.current = L.polyline(
        cps.map((c) => [c.latitude, c.longitude]),
        { color: '#c6ff3d', weight: 3, dashArray: '8 8', opacity: 0.8 }
      ).addTo(mapRef.current);
    }
  }, []);

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

    const onMapClick = (e) => {
      const { lat, lng } = e.latlng;
      setCheckpoints((prev) => [...prev, { latitude: lat, longitude: lng, radius_m: 30 }]);
      setClientErrors((s) => ({ ...s, checkpoints: undefined }));
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
        // ignore
      }
      mapRef.current = null;
      markersRef.current = [];
      polylineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => {
      try { mapRef.current.removeLayer(m); } catch { /* layer may already be removed */ }
    });
    markersRef.current = checkpoints.map((cp, i) => placeCheckpointMarker(cp, i));
    updatePolyline(checkpoints);
  }, [checkpoints, placeCheckpointMarker, updatePolyline]);

  const removeCheckpoint = (index) => {
    setCheckpoints((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleParticipant = (id) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setClientErrors((s) => ({ ...s, participants: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (selectedParticipants.length < 1) errs.participants = 'Обери хоча б одного учасника.';
    if (selectedParticipants.length > 8) errs.participants = 'Максимум 8 учасників.';
    if (checkpoints.length < 2) errs.checkpoints = 'Потрібно мінімум 2 чекпоїнти (натисни на карту).';
    if (!noTimeLimit && durationMinutes < 1) errs.duration = 'Мінімальна тривалість — 1 хвилина.';
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
        title: 'Крос',
        category: 'cross',
        latitude: checkpoints[0].latitude,
        longitude: checkpoints[0].longitude,
        started_at: new Date().toISOString(),
        participant_ids: selectedParticipants,
        geofence_radius_m: 50,
        ...(noTimeLimit ? {} : { duration_seconds: durationMinutes * 60 }),
        checkpoints_data: checkpoints.map((cp, i) => ({
          latitude: cp.latitude,
          longitude: cp.longitude,
          order: i + 1,
          radius_m: cp.radius_m,
        })),
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
        <label>Маршрут кросу * (натисни на карту, щоб додати чекпоїнт)</label>
        <div className={styles.mapPreview} ref={mapContainerRef} />
        {checkpoints.length > 0 && (
          <div className={styles.checkpointList}>
            {checkpoints.map((cp, i) => (
              <div key={i} className={styles.checkpointChip}>
                <span
                  className={styles.checkpointDot}
                  style={{ background: CHECKPOINT_COLORS[i % CHECKPOINT_COLORS.length] }}
                />
                <span className={styles.checkpointLabel}>{i + 1}</span>
                <button
                  type="button"
                  className={styles.checkpointRemove}
                  onClick={() => removeCheckpoint(i)}
                  aria-label={`Видалити чекпоїнт ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {clientErrors.checkpoints && (
          <div className={styles.fieldError}><ErrorIcon />{clientErrors.checkpoints}</div>
        )}
      </div>

      <div className={styles.field}>
        <label>Тривалість (хв)</label>
        <label className={styles.noTimeLimitToggle}>
          <input
            type="checkbox"
            checked={noTimeLimit}
            onChange={(e) => setNoTimeLimit(e.target.checked)}
          />
          Без обмеження часу
        </label>
        {!noTimeLimit && (
          <>
            <div className={styles.durationRow}>
              {[5, 10, 15, 20, 30, 60].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`${styles.durationPill} ${durationMinutes === m ? styles.durationPillActive : ''}`}
                  onClick={() => setDurationMinutes(m)}
                >
                  {m >= 60 ? `${m / 60}год` : `${m}хв`}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={1440}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className={styles.durationInput}
            />
          </>
        )}
        {clientErrors.duration && (
          <div className={styles.fieldError}><ErrorIcon />{clientErrors.duration}</div>
        )}
      </div>

      <div className={styles.field}>
        <label>Учасники (1–8)</label>
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
              {participantFilter === 'friends'
                ? 'Немає друзів поруч'
                : 'Немає доступних користувачів поруч'}
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
        {clientErrors.participants && <div className={styles.fieldError}><ErrorIcon />{clientErrors.participants}</div>}
      </div>

      {errors && (
        <div className={styles.serverErrors}>
          {typeof errors === 'string'
            ? <div>{errors}</div>
            : Object.entries(errors).map(([k, v]) => (
                <div key={k}><strong>{k}:</strong> {Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? Object.values(v).join('; ') : String(v)}</div>
              ))}
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" onClick={onCancel} className={styles.cancelBtn}>Скасувати</button>
        <button type="submit" className={styles.submitBtn} disabled={submitting}>
          {submitting ? 'Створюємо…' : 'Створити крос'}
        </button>
      </div>
    </form>
  );
}
