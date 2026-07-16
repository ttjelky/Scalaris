import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';

import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import MapView from '../../components/Map/MapView';
import Navbar from '../../components/Navbar/Navbar';
import styles from './Home.module.css';

const ActivityForm = lazy(() => import('../../components/ActivityForm/ActivityForm'));

// How far (px) the sheet has to be dragged before it snaps
// collapsed/expanded instead of springing back.
const COLLAPSE_THRESHOLD = 56;
const EXPAND_THRESHOLD = 32;

// Invitation.Status choices from the backend, mapped to display text and
// a CSS-module class suffix for the status badge in the ongoing view.
const PARTICIPANT_STATUS = {
  pending: { label: 'очікування', className: 'statusPending' },
  accepted: { label: 'прийнято', className: 'statusAccepted' },
  arrived: { label: 'на місці', className: 'statusArrived' },
  declined: { label: 'відхилено', className: 'statusDeclined' },
  left: { label: 'вийшов(ла)', className: 'statusLeft' },
};

// Formats elapsed ms as a compact clock string for the small hero badge,
// e.g. "05:23" or "1:02:07" once it runs past an hour.
function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Same duration, but as a friendly phrase for the expanded body text,
// e.g. "5 хв 23 с" or "1 год 4 хв".
function formatDurationLong(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h} год ${m} хв`;
  if (m > 0) return `${m} хв ${s} с`;
  return `${s} с`;
}

// Ticks once a second while an activity is ongoing, giving back the
// elapsed time in ms since its started_at.
function useElapsedTime(startedAt) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return undefined;
    }
    const startMs = new Date(startedAt).getTime();
    const update = () => setElapsed(Math.max(0, Date.now() - startMs));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

// Only one activity type exists for now. Kept as a list so more can be
// added later without reshaping the pill row or the sheet-switching logic.
const ACTIVITIES = [
  {
    id: 'gathering',
    label: 'Збір',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 21s-7-6.1-7-11.2C5 5.5 8.1 3 12 3s7 2.5 7 6.8C19 14.9 12 21 12 21z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="9.5" r="2.3" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
];

export default function Home() {
  const { user } = useAuth();
  const mapRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [nearbyActivities, setNearbyActivities] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Which activity (if any) is currently being created. The bottom sheet
  // switches its content based on this instead of opening a separate modal.
  const [activeActivityId, setActiveActivityId] = useState(null);
  const [toast, setToast] = useState(null);

  // The gathering that was just created, still running. While this is set
  // (and no form is being filled out), the bottom sheet shows its title,
  // live duration, and participants instead of the nearby-people list.
  const [ongoingActivity, setOngoingActivity] = useState(null);
  const ongoingElapsed = useElapsedTime(ongoingActivity?.started_at);
  const [leaving, setLeaving] = useState(false);

  // --- Draggable bottom sheet state -------------------------------------
  const [sheetState, setSheetState] = useState('collapsed');
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef(null);
  const dragStartY = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const rafRef = useRef(null);
  const hasDragged = useRef(false);

  const activeActivity = useMemo(
    () => ACTIVITIES.find((a) => a.id === activeActivityId) || null,
    [activeActivityId]
  );

  const applyDragTransform = () => {
    rafRef.current = null;
    if (sheetRef.current) {
      sheetRef.current.style.transform = dragYRef.current
        ? `translateY(${dragYRef.current}px)`
        : '';
    }
  };

  const handlePointerDown = (e) => {
    if (activeActivity) return; // no drag-to-collapse while filling out the form
    dragStartY.current = e.clientY;
    dragYRef.current = 0;
    hasDragged.current = false;
    isDraggingRef.current = true;
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if not supported
    }
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientY - dragStartY.current;
    if (Math.abs(delta) > 4) hasDragged.current = true;

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
    if (activeActivity) return; // header no longer toggles collapse mid-form
    if (hasDragged.current) return;
    setSheetState((prev) => (prev === 'collapsed' ? 'expanded' : 'collapsed'));
  };

  // Один "Збір" за раз: поки щось триває, кнопки створення нової активності
  // вимкнені — спершу треба вийти з поточної.
  const canCreateActivity = !ongoingActivity;

  const handlePillClick = (activity) => {
    if (!canCreateActivity) return;
    setActiveActivityId(activity.id);
    setSheetState('expanded');
  };

  const handleCancelCreate = () => {
    setActiveActivityId(null);
  };
  // ------------------------------------------------------------------------

  // Переживає перезавантаження сторінки: React-стейт сам по собі зникає
  // при reload, тож на кожен маунт питаємо бекенд, чи є в мене зараз
  // live-збір, і якщо є — одразу показуємо ongoing-вʼю замість людей поруч.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/activities/my-active/');
        if (!cancelled && data) {
          setOngoingActivity(data);
        }
      } catch {
        // немає активного збору (або запит не вдався) — лишаємось на дефолтному екрані
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Цей браузер не підтримує визначення геопозиції.');
      setLoading(false);
      return undefined;
    }

    let didRespond = false;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        didRespond = true;
        const nextPosition = [pos.coords.latitude, pos.coords.longitude];
        setPosition(nextPosition);
        setError('');
        setLoading(false);

        // nearby users (best-effort)
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

        // sync location to backend (best-effort)
        try {
          await api.post('/activities/locations/', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        } catch {
          // ignore
        }
      },
      (err) => {
        didRespond = true;
        setLoading(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Доступ до геопозиції заборонено. Дозволь його в налаштуваннях браузера, щоб зʼявитися на карті.'
            : 'Не вдалося визначити місцезнаходження. Перевір, чи увімкнена геолокація.'
        );
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    // Fallback: якщо через 12s немає відповіді — показати повідомлення
    const fallback = setTimeout(() => {
      if (!didRespond) {
        setLoading(false);
        setError('Не вдалося швидко визначити місцезнаходження. Спробуйте оновити сторінку або дозволити геолокацію.');
      }
    }, 12000);

    return () => {
      clearTimeout(fallback);
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        // ignore
      }
    };
  }, []);

  const nearbyCount = useMemo(() => nearbyUsers.length, [nearbyUsers]);

  // While a gathering is ongoing, periodically re-fetch it so newly accepted
  // participants (participants[].status, from the backend) show up on the
  // map highlight without the person having to do anything.
  useEffect(() => {
    if (!ongoingActivity?.id) return undefined;

    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api.get(`/activities/${ongoingActivity.id}/`);
        if (!cancelled) {
          setOngoingActivity((prev) => (prev && prev.id === data.id ? { ...prev, ...data } : prev));
        }
      } catch {
        // best-effort — keep showing whatever we already have
      }
    };

    const intervalId = setInterval(poll, 6000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [ongoingActivity?.id]);

  // Point + accepted-participant ids for the map, derived from the ongoing
  // activity. null when there's nothing to show.
  const gatheringMapData = useMemo(() => {
    if (!ongoingActivity) return null;
    return {
      point: [ongoingActivity.latitude, ongoingActivity.longitude],
      title: ongoingActivity.title,
      acceptedIds: (ongoingActivity.participants || [])
        .filter((p) => p.status === 'accepted' || p.status === 'arrived')
        .map((p) => p.id),
    };
  }, [ongoingActivity]);

  const handleLeaveActivity = async () => {
    if (!ongoingActivity?.id || leaving) return;
    setLeaving(true);
    try {
      await api.post(`/activities/${ongoingActivity.id}/leave/`);
    } catch {
      // best-effort — ховаємо локально в будь-якому разі, щоб не залипало в UI
    } finally {
      setLeaving(false);
      setOngoingActivity(null);
      setSheetState('collapsed');
    }
  };

  const recenterToMe = () => {
    if (position && mapRef.current) {
      try {
        mapRef.current.setView(position, mapRef.current.getZoom(), { animate: true });
      } catch {
        // if mapRef isn't a Leaflet map instance, ignore
      }
    }
  };
  const sheetClassName = [
    styles.sheet,
    sheetState === 'collapsed' && styles.sheetCollapsed,
    isDragging && styles.sheetDragging,
  ]
    .filter(Boolean)
    .join(' ');

  // Activity created: show toast, refresh nearby activities, and switch the
  // sheet over to the "ongoing activity" view instead of the people list.
  const handleActivityCreated = async (activity) => {
    setActiveActivityId(null);
    setOngoingActivity(activity);
    setSheetState('collapsed');
    setToast('Збір створено успішно');
    setTimeout(() => setToast(null), 3500);

    if (position) {
      try {
        const { data } = await api.get('/activities/near-me/', {
          params: { lat: position[0], lng: position[1], radius: 5 },
        });
        setNearbyActivities(data);
      } catch {
        // ignore errors here
      }
    }
  };

  return (
    <div className={styles.screen}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <Navbar />
          <div className={styles.topbarActions}>
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

            <Link to="/profile" className={styles.greetingBlock}>
              {user?.avatar ? (
                <img src={user.avatar} alt="" className={styles.greetingAvatar} />
              ) : (
                <span className={styles.greetingAvatarFallback}>{user?.username?.slice(0, 1).toUpperCase()}</span>
              )}
              <span className={styles.greeting}>{user?.username}</span>
            </Link>
          </div>
        <div className={styles.topbarRow}>
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
        </div>

        <div className={styles.activityPills}>
          {ACTIVITIES.map((activity) => (
            <button
              key={activity.id}
              type="button"
              className={`${styles.activityPill} ${activeActivityId === activity.id ? styles.activityPillActive : ''}`}
              onClick={() => handlePillClick(activity)}
              disabled={!canCreateActivity}
              title={canCreateActivity ? undefined : 'Спочатку заверши поточний збір'}
            >
              {activity.icon}
              <span>{activity.label}</span>
            </button>
          ))}
        </div>
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
          <MapView
            ref={mapRef}
            position={position}
            nearbyUsers={nearbyUsers}
            activities={nearbyActivities}
            gathering={gatheringMapData}
          />
        )}
      </div>

      <div
        className={`${styles.scrim} ${sheetState === 'expanded' ? styles.scrimVisible : ''}`}
        onClick={() => !activeActivity && setSheetState('collapsed')}
        aria-hidden="true"
      />

      <div ref={sheetRef} className={sheetClassName}>
        <div className={styles.sheetHeader} onClick={handleHeaderClick}>
          <div
            className={styles.sheetHandle}
            aria-hidden="true"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          />

          <div className={styles.heroRow}>
            {activeActivity ? (
              <>
                <button
                  type="button"
                  className={styles.sheetBackBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelCreate();
                  }}
                  aria-label="Назад"
                >
                  ←
                </button>
                <h1 className={styles.heroTitle}>{activeActivity.label}</h1>
                <span className={styles.sheetBackSpacer} aria-hidden="true" />
              </>
            ) : ongoingActivity ? (
              <>
                <button
                  type="button"
                  className={styles.sheetBackBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOngoingActivity(null);
                  }}
                  aria-label="До людей поруч"
                >
                  ←
                </button>
                <h1 className={styles.heroTitle}>{ongoingActivity.title || 'Збір'}</h1>
                <div className={styles.heroBadge}>
                  <span className={`${styles.heroBadgeValue} ${styles.heroBadgeValueClock}`}>
                    {formatClock(ongoingElapsed)}
                  </span>
                  <span className={styles.heroBadgeLabel}>триває</span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className={styles.kicker}>Твоя зона активності</p>
                  <h1 className={styles.heroTitle}>Люди поруч</h1>
                </div>
                <div className={styles.heroBadge}>
                  <span key={nearbyCount} className={styles.heroBadgeValue}>
                    {nearbyCount}
                  </span>
                  <span className={styles.heroBadgeLabel}>поруч</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div
          className={`${styles.collapsibleContent} ${
            sheetState === 'collapsed' ? styles.collapsibleContentHidden : ''
          }`}
        >
          <div className={styles.collapsibleInner}>
            {activeActivity ? (
              <Suspense fallback={<div className={styles.formLoading}>Завантаження форми…</div>}>
                <ActivityForm
                  initialPosition={position}
                  nearbyUsers={nearbyUsers}
                  onCancel={handleCancelCreate}
                  onCreated={handleActivityCreated}
                />
              </Suspense>
            ) : ongoingActivity ? (
              <div className={styles.ongoingWrap}>
                <p className={styles.heroText}>
                  {ongoingActivity.title || 'Збір'} триває вже {formatDurationLong(ongoingElapsed)}.
                </p>

                <p className={styles.ongoingParticipantsTitle}>Учасники</p>
                <div className={styles.ongoingParticipantsList}>
                  {(ongoingActivity.participants || []).length === 0 ? (
                    <div className={styles.empty}>Немає учасників</div>
                  ) : (
                    ongoingActivity.participants.map((p) => {
                      const statusInfo = PARTICIPANT_STATUS[p.status] || { label: p.status, className: '' };
                      return (
                        <div key={p.id} className={styles.ongoingParticipant}>
                          <span className={styles.ongoingParticipantAvatar}>
                            {p.username?.slice(0, 1).toUpperCase()}
                          </span>
                          <span className={styles.ongoingParticipantName}>{p.username}</span>
                          <span
                            className={`${styles.ongoingParticipantStatus} ${styles[statusInfo.className] || ''}`}
                          >
                            {statusInfo.label}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <button
                  type="button"
                  className={styles.leaveBtn}
                  onClick={handleLeaveActivity}
                  disabled={leaving}
                >
                  {leaving ? 'Виходимо…' : 'Вийти'}
                </button>
              </div>
            ) : (
              <>
                <p className={styles.heroText}>
                  Радіус 5 км. Приєднуйся до когось поруч або чекай, поки хтось приєднається до тебе.
                </p>

                <div className={styles.userList} key={sheetState}>
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
              </>
            )}
          </div>
        </div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}