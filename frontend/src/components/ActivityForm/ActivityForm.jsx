import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import api from '../../api/axios';
import styles from './ActivityForm.module.css';

/**
 * Inline "Збір" form, rendered inside Home's bottom sheet (not a modal).
 * Deliberately minimal: pick a spot on the map, pick participants. The
 * gathering starts immediately at submit time — there's no scheduling.
 *
 * Props:
 * - initialPosition: [lat, lng] | null
 * - nearbyUsers: array of users { id, username }
 * - onCancel: () => void
 * - onCreated: (activity) => void  // activity is enriched with participantsDetails
 */
function ErrorIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

export default function ActivityForm({ initialPosition, nearbyUsers = [], onCancel, onCreated }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [latLng, setLatLng] = useState(initialPosition || null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState(null);
  const [clientErrors, setClientErrors] = useState({});

  const placeMarker = (p) => {
    if (!mapRef.current) return;
    if (markerRef.current) {
      markerRef.current.setLatLng(p);
    } else {
      markerRef.current = L.marker(p, { draggable: true }).addTo(mapRef.current);
      markerRef.current.on('dragend', (e) => {
        const q = e.target.getLatLng();
        setLatLng([q.lat, q.lng]);
      });
    }
  };

  // init map — mounts while the sheet is still animating open, so the
  // container has no real size yet. We size/center it once, then nudge
  // Leaflet with invalidateSize() after the CSS grid expand transition
  // (see Home.module.css .collapsibleContent) has finished.
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

    if (initialPosition) placeMarker(initialPosition);

    const onMapClick = (e) => {
      const { lat, lng } = e.latlng;
      setLatLng([lat, lng]);
      placeMarker([lat, lng]);
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
        // ignore
      }
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!latLng) errs.location = 'Постав мітку на карті.';
    setClientErrors(errs);
    return Object.keys(errs).length === 0;
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
        }
        setClientErrors((s) => ({ ...s, location: undefined }));
      },
      () => {
        setClientErrors((s) => ({ ...s, location: 'Не вдалося отримати поточну позицію.' }));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const body = {
        title: 'Збір',
        category: 'hangout',
        latitude: latLng[0],
        longitude: latLng[1],
        started_at: new Date().toISOString(),
        participant_ids: selectedParticipants,
        geofence_radius_m: 50,
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
        <label>Місце збору *</label>
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
        <label>Учасники (1–8)</label>
        <div className={styles.participantsList}>
          {nearbyUsers.length === 0 && <div className={styles.empty}>Немає доступних користувачів поруч</div>}
          {nearbyUsers.map((u) => {
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
                <div key={k}><strong>{k}:</strong> {Array.isArray(v) ? v.join('; ') : String(v)}</div>
              ))}
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" onClick={onCancel} className={styles.cancelBtn}>Скасувати</button>
        <button type="submit" className={styles.submitBtn} disabled={submitting}>
          {submitting ? 'Створюємо…' : 'Зібратися'}
        </button>
      </div>
    </form>
  );
}
