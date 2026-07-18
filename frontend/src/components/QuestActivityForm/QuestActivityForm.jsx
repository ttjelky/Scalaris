import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { getFriends } from '../../api/friends';
import styles from './QuestActivityForm.module.css';

function ErrorIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

export default function QuestActivityForm({ initialPosition, nearbyUsers = [], onCancel, onCreated }) {
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [durationMinutes, setDurationMinutes] = useState(15);
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
    if (durationMinutes < 1) errs.duration = 'Мінімальна тривалість — 1 хвилина.';
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
        title: 'Квест',
        category: 'quest',
        started_at: new Date().toISOString(),
        participant_ids: selectedParticipants,
        duration_seconds: durationMinutes * 60,
        latitude: initialPosition?.[0] ?? 0,
        longitude: initialPosition?.[1] ?? 0,
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
      <div className={styles.questBanner}>
        <div className={styles.questIcon}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </div>
        <p className={styles.questDesc}>Хто пройде найбільше кілометрів за відведений час — той переміг!</p>
      </div>

      <div className={styles.field}>
        <label>Тривалість (хв)</label>
        <div className={styles.durationRow}>
          {[5, 10, 15, 30, 60].map((m) => (
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
        {clientErrors.duration && <div className={styles.fieldError}><ErrorIcon />{clientErrors.duration}</div>}
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
          {submitting ? 'Створюємо…' : 'Почати квест'}
        </button>
      </div>
    </form>
  );
}
