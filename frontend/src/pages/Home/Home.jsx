import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { getFriends } from '../../api/friends';
import MapView from '../../components/Map/MapView';
import Navbar from '../../components/Navbar/Navbar';
import useActivitySocket from '../../hooks/useActivitySocket';
import styles from './Home.module.css';

const ActivityForm = lazy(() => import('../../components/ActivityForm/ActivityForm'));
const CrossActivityForm = lazy(() => import('../../components/CrossActivityForm/CrossActivityForm'));
const GameZoneForm = lazy(() => import('../../components/GameZoneForm/GameZoneForm'));

// Drag distance (px) needed to trigger a state change when releasing the sheet.
const COLLAPSE_THRESHOLD = 60;
const EXPAND_THRESHOLD = 40;

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

// Great-circle distance (km) between two [lat, lng] points, used to show
// how far the user currently is from an ongoing gathering's location.
function haversineDistanceKm([lat1, lon1], [lat2, lon2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Formats a distance in km as a short label for the hero row, switching to
// meters under 1 km, e.g. "850 м" or "3.4 км".
function formatDistance(km) {
  if (km == null || Number.isNaN(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} м`;
  return `${km.toFixed(km < 10 ? 1 : 0)} км`;
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
  {
    id: 'cross',
    label: 'Крос',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="20" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="20" r="2" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: 'zone',
    label: 'Ігрова зона',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
];

export default function Home() {
  const { user, updateUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [nearbyActivities, setNearbyActivities] = useState([]);
  const [activeZones, setActiveZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const authRef = useRef(isAuthenticated);

  useEffect(() => {
    authRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const [friendsOnly, setFriendsOnly] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [hideNonParticipants, setHideNonParticipants] = useState(false);
  const [hiddenZoneIds, setHiddenZoneIds] = useState(new Set());

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

  // Auto-expire cross activities on the client side when countdown hits 0.
  useEffect(() => {
    if (!ongoingActivity) return;
    if (ongoingActivity.category !== 'cross' || !ongoingActivity.duration_seconds) return;
    const remaining = ongoingActivity.duration_seconds * 1000 - ongoingElapsed;
    if (remaining > 0) return;
    setOngoingActivity(null);
    setSheetState('collapsed');
  }, [ongoingElapsed, ongoingActivity]);

  // --- Draggable bottom sheet state -------------------------------------
  const [sheetState, setSheetState] = useState('collapsed');
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef(null);
  const dragStartY = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const rafRef = useRef(null);
  const hasDragged = useRef(false);

  const isCreator = ongoingActivity && user && ongoingActivity.creator?.id === user.id;

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
    if (ongoingActivity && !isCreator) return; // non-creators can't collapse ongoing activity
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
      if (!(ongoingActivity && !isCreator)) {
        setSheetState('collapsed');
      }
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
    if (ongoingActivity && !isCreator) return; // non-creators can't collapse ongoing activity
    if (hasDragged.current) return;
    setSheetState((prev) => (prev === 'collapsed' ? 'expanded' : 'collapsed'));
  };

  // Один "Збір" за раз: поки щось триває, кнопки створення нової активності
  // вимкнені — спершу треба вийти з поточної.
  const canCreateActivity = !ongoingActivity;

  const handlePillClick = (activity) => {
    if (!canCreateActivity) return;
    setSelectedZone(null);
    setActiveActivityId(activity.id);
    setSheetState('expanded');
  };

  const handleCancelCreate = () => {
    setActiveActivityId(null);
  };

  // Same destination as the user cards in the bottom-sheet list — used by
  // MapView's mini profile card when tapping a user marker on the map.
  const handleViewProfile = (person) => {
    navigate(`/profile/${person.id}`);
  };

  const visibleZones = useMemo(
    () => activeZones.filter((z) => !hiddenZoneIds.has(z.id)),
    [activeZones, hiddenZoneIds]
  );

  const handleZoneClick = (zone) => {
    setSelectedZone(zone);
    setSheetState('expanded');
  };

  const handleHideZone = (zone) => {
    setHiddenZoneIds((prev) => new Set([...prev, zone.id]));
    setSelectedZone(null);
    setSheetState('collapsed');
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
    let cancelled = false;
    getFriends()
      .then(({ data }) => {
        if (!cancelled) {
          setFriendsList(Array.isArray(data) ? data : data.results || []);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const friendIdSet = useMemo(() => new Set(friendsList.map((f) => f.id)), [friendsList]);

  const activityParticipantIds = useMemo(() => {
    if (!ongoingActivity) return null;
    const activeStatuses = new Set(['accepted', 'arrived']);
    const ids = (ongoingActivity.participants || [])
      .filter((p) => activeStatuses.has(p.status))
      .map((p) => p.id);
    if (ongoingActivity.creator?.id && !ids.includes(ongoingActivity.creator.id)) {
      ids.push(ongoingActivity.creator.id);
    }
    return new Set(ids);
  }, [ongoingActivity]);

  const nearbyUsersFiltered = useMemo(() => {
    let list = nearbyUsers;
    if (friendsOnly) {
      list = list.filter((u) => friendIdSet.has(u.id));
    }
    if (hideNonParticipants && activityParticipantIds) {
      list = list.filter((u) => activityParticipantIds.has(u.id));
    }
    return list;
  }, [nearbyUsers, friendsOnly, friendIdSet, hideNonParticipants, activityParticipantIds]);

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

        if (!authRef.current) return;

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

        // active game zones nearby (best-effort)
        try {
          const { data } = await api.get('/activities/zones/nearby/', {
            params: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              radius: 5,
            },
          });
          setActiveZones(data);
        } catch {
          setActiveZones([]);
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

  const nearbyCount = useMemo(() => nearbyUsersFiltered.length, [nearbyUsersFiltered]);

  // Distance from the user's current position to the ongoing gathering's
  // point, shown under the "Збір" title in the sheet header.
  const ongoingDistanceLabel = useMemo(() => {
    if (!position || !ongoingActivity?.latitude || !ongoingActivity?.longitude) return null;
    const km = haversineDistanceKm(position, [ongoingActivity.latitude, ongoingActivity.longitude]);
    return formatDistance(km);
  }, [position, ongoingActivity]);

  // Participant count for the ongoing gathering, shown in place of the
  // back arrow while the sheet is collapsed.
  const ongoingParticipantsCount = useMemo(
    () => (ongoingActivity?.participants || []).length,
    [ongoingActivity]
  );

  // Real-time participant updates via WebSocket (replaces 6-second polling).
  const { participants: wsParticipants, cancelled: wsCancelled } =
    useActivitySocket(ongoingActivity?.id || null);

  // Merge WebSocket updates into ongoingActivity state.
  useEffect(() => {
    if (!ongoingActivity?.id) return;
    if (wsParticipants.length > 0) {
      setOngoingActivity((prev) => (prev && prev.id === ongoingActivity.id ? { ...prev, participants: wsParticipants } : prev));
    }
  }, [wsParticipants, ongoingActivity?.id]);

  useEffect(() => {
    if (wsCancelled && ongoingActivity) {
      setOngoingActivity(null);
      setSheetState('collapsed');
    }
  }, [wsCancelled, ongoingActivity]);

  // Point + accepted-participant ids for the map, derived from the ongoing
  // activity. null when there's nothing to show.
  const gatheringMapData = useMemo(() => {
    if (!ongoingActivity) return null;
    return {
      point: [ongoingActivity.latitude, ongoingActivity.longitude],
      title: ongoingActivity.title,
      category: ongoingActivity.category,
      description: ongoingActivity.description,
      radius: ongoingActivity.geofence_radius_m,
      creator: ongoingActivity.creator,
      participantCount: (ongoingActivity.participants || []).length,
      acceptedIds: (ongoingActivity.participants || [])
        .filter((p) => p.status === 'accepted' || p.status === 'arrived')
        .map((p) => p.id),
    };
  }, [ongoingActivity]);

  const checkpointsMapData = useMemo(() => {
    if (!ongoingActivity || ongoingActivity.category !== 'cross') return null;
    const cps = ongoingActivity.checkpoints || [];
    if (cps.length === 0) return null;

    // Find passed checkpoint IDs (from the creator's or first participant's perspective)
    const me = (ongoingActivity.participants || []).find((p) => p.id === user?.id);
    const myPassed = me?.passed_checkpoints || [];

    // Current = first checkpoint not yet passed
    const current = cps.find((cp) => !myPassed.includes(cp.id)) || null;

    return {
      items: cps,
      currentId: current?.id || null,
      passedIds: myPassed,
      userPosition: position,
    };
  }, [ongoingActivity, user?.id, position]);

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
      setHideNonParticipants(false);
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

  const visibleOnMap = user?.is_visible_on_map ?? true;

  const hasActivity = !!ongoingActivity;

  const toggleVisibility = async () => {
    if (hasActivity) {
      setHideNonParticipants((prev) => !prev);
      return;
    }
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

  // Activity created: show toast, refresh nearby activities, and switch the
  // sheet over to the "ongoing activity" view instead of the people list.
  const handleActivityCreated = async (activity) => {
    setActiveActivityId(null);
    // ActivitySerializer already returns the fully enriched creator +
    // participants on create (same shape as GET), so set it synchronously
    // — no need for an extra round trip, which only adds a flash back to
    // the "nearby users" view while it's in flight.
    setOngoingActivity(activity);
    setSheetState('collapsed');
    const toastMsg = activity.category === 'cross' ? 'Крос створено успішно' : 'Збір створено успішно';
    setToast(toastMsg);
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
            aria-pressed={hasActivity ? hideNonParticipants : visibleOnMap}
            aria-label={hasActivity
              ? (hideNonParticipants ? 'Показати всіх на карті' : 'Приховати не-учасників')
              : (visibleOnMap ? 'Сховати мене з карти' : 'Показати мене на карті')}
            title={hasActivity
              ? (hideNonParticipants ? 'Показати всіх' : 'Тільки учасники')
              : (visibleOnMap ? 'Видимий на карті' : 'Прихований з карти')}
          >
            {hasActivity ? (
              hideNonParticipants ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
                  <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )
            ) : visibleOnMap ? (
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

          <button
            className={`${styles.friendsFilterButton} ${friendsOnly ? styles.friendsFilterButtonActive : ''}`}
            onClick={() => setFriendsOnly((prev) => !prev)}
            type="button"
            aria-pressed={friendsOnly}
            aria-label={friendsOnly ? 'Показати всіх на карті' : 'Показати тільки друзів'}
            title={friendsOnly ? 'Тільки друзі' : 'Всі'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
              <path
                d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
            nearbyUsers={nearbyUsersFiltered}
            activities={nearbyActivities}
            zones={visibleZones}
            onZoneClick={handleZoneClick}
            gathering={gatheringMapData}
            checkpoints={checkpointsMapData}
            onViewProfile={handleViewProfile}
          />
        )}
      </div>

      <div
        className={`${styles.scrim} ${sheetState === 'expanded' ? styles.scrimVisible : ''}`}
        onClick={() => !activeActivity && setSheetState('collapsed')}
        aria-hidden="true"
      />

      {(hideNonParticipants || friendsOnly) && sheetState !== 'expanded' && (
        <span className={styles.filterBadge}>
          {hideNonParticipants && friendsOnly
            ? 'Друзі · Учасники'
            : hideNonParticipants
              ? 'Учасники'
              : 'Лише друзі'}
        </span>
      )}

      <div ref={sheetRef} className={sheetClassName}>
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
                <div className={styles.heroTitleBlock}>
                  <h1 className={styles.heroTitle}>{activeActivity.label}</h1>
                </div>
                <span className={styles.sheetBackSpacer} aria-hidden="true" />
              </>
            ) : ongoingActivity ? (
              <>
                <div className={styles.heroRowParticipants}>
                  <div
                    className={styles.heroParticipantsCircle}
                    aria-label={`Учасників у зборі: ${ongoingParticipantsCount}`}
                  >
                    {ongoingParticipantsCount}
                  </div>
                  <span className={styles.heroRowParticipantsLabel}>учасник</span>
                </div>
                <div className={styles.heroTitleBlock}>
                  <h1 className={styles.heroTitle}>{ongoingActivity.title || 'Збір'}</h1>
                  {ongoingDistanceLabel && (
                    <p className={styles.heroDistance}>{ongoingDistanceLabel}</p>
                  )}
                </div>
                <div className={styles.heroBadgeBlock}>
                  <div className={styles.heroBadge}>
                    <span className={`${styles.heroBadgeValue} ${styles.heroBadgeValueClock}`}>
                      {ongoingActivity.category === 'cross' && ongoingActivity.duration_seconds
                        ? formatClock(Math.max(0, ongoingActivity.duration_seconds * 1000 - ongoingElapsed))
                        : formatClock(ongoingElapsed)}
                    </span>
                  </div>
                  <span className={styles.heroBadgeLabel}>
                    {ongoingActivity.category === 'cross' && ongoingActivity.duration_seconds ? 'залишилось' : 'триває'}
                  </span>
                </div>
              </>
            ) : selectedZone ? (
              <>
                <button
                  type="button"
                  className={styles.sheetBackBtn}
                  onClick={(e) => { e.stopPropagation(); setSelectedZone(null); setSheetState('collapsed'); }}
                  aria-label="Закрити"
                >
                  ←
                </button>
                <div className={styles.heroTitleBlock}>
                  <h1 className={styles.heroTitle}>{selectedZone.title}</h1>
                  <p className={styles.heroDistance}>Радіус: {selectedZone.radius || 80} м</p>
                </div>
                <div className={styles.heroBadge}>
                  <span className={styles.heroBadgeValue}>
                    {selectedZone.participants?.length || 0}
                  </span>
                  <span className={styles.heroBadgeLabel}>учасників</span>
                </div>
              </>
            ) : (
              <>
                <div className={styles.heroTitleBlockLeft}>
                  <p className={styles.kicker}>Твоя зона активності</p>
                  <h1 className={styles.heroTitle}>Люди поруч</h1>
                </div>
                <div className={styles.heroBadgeBlock}>
                  <div className={styles.heroBadge}>
                    <span key={nearbyCount} className={styles.heroBadgeValue}>
                      {nearbyCount}
                    </span>
                  </div>
                  <span className={styles.heroBadgeLabel}>поруч</span>
                </div>
              </>
            )}
          </div>
        </div>

        {activeActivity ? (
          <Suspense fallback={<div className={styles.formLoading}>Завантаження форми…</div>}>
            {activeActivity.id === 'cross' ? (
              <CrossActivityForm
                initialPosition={position}
                nearbyUsers={nearbyUsers}
                onCancel={handleCancelCreate}
                onCreated={handleActivityCreated}
              />
            ) : activeActivity.id === 'zone' ? (
              <GameZoneForm
                initialPosition={position}
                nearbyUsers={nearbyUsers}
                onCancel={handleCancelCreate}
                onCreated={handleActivityCreated}
              />
            ) : (
              <ActivityForm
                initialPosition={position}
                nearbyUsers={nearbyUsers}
                onCancel={handleCancelCreate}
                onCreated={handleActivityCreated}
              />
            )}
          </Suspense>
        ) : ongoingActivity ? (
          <div className={styles.ongoingWrap}>
            {ongoingActivity.category === 'cross' ? (
              <>
                <p className={styles.heroText}>
                  {ongoingActivity.duration_seconds ? (
                    <>Залишилось {formatDurationLong(Math.max(0, ongoingActivity.duration_seconds * 1000 - ongoingElapsed))}.</>
                  ) : (
                    <>Крос триває вже {formatDurationLong(ongoingElapsed)}.</>
                  )}
                </p>

                <p className={styles.ongoingParticipantsTitle}>Прогрес</p>
                <div className={styles.checkpointProgress}>
                  {(ongoingActivity.checkpoints || []).map((cp) => {
                    const passedByAnyone = (ongoingActivity.participants || []).some(
                      (p) => (p.passed_checkpoints || []).includes(cp.id)
                    );
                    return (
                      <div
                        key={cp.id}
                        className={`${styles.checkpointStep} ${passedByAnyone ? styles.checkpointStepPassed : ''}`}
                      >
                        <span className={styles.checkpointStepNumber}>{cp.order}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className={styles.heroText}>
                {ongoingActivity.title || 'Збір'} триває вже {formatDurationLong(ongoingElapsed)}.
              </p>
            )}

            <p className={styles.ongoingParticipantsTitle}>Учасники</p>
            <div className={styles.ongoingParticipantsList}>
              {(ongoingActivity.participants || []).length === 0 ? (
                <div className={styles.emptyState}>Немає учасників</div>
              ) : (
                ongoingActivity.participants.map((p) => {
                  const statusInfo = PARTICIPANT_STATUS[p.status] || { label: p.status, className: '' };
                  return (
                    <div key={p.id} className={styles.ongoingParticipant}>
                      {p.avatar ? (
                        <img src={p.avatar} alt="" className={styles.ongoingParticipantAvatarImg} />
                      ) : (
                        <span className={styles.ongoingParticipantAvatar}>
                          {p.username?.slice(0, 1).toUpperCase()}
                        </span>
                      )}
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
        ) : selectedZone ? (
          <div className={styles.ongoingWrap}>
            {selectedZone.description && (
              <p className={styles.heroText}>{selectedZone.description}</p>
            )}

            <div className={styles.zoneInfoRow}>
              <span className={styles.zoneInfoLabel}>Створив</span>
              <span className={styles.zoneInfoValue}>
                {selectedZone.creator?.username || '—'}
              </span>
            </div>
            <div className={styles.zoneInfoRow}>
              <span className={styles.zoneInfoLabel}>Радіус</span>
              <span className={styles.zoneInfoValue}>{selectedZone.radius || 80} м</span>
            </div>
            <div className={styles.zoneInfoRow}>
              <span className={styles.zoneInfoLabel}>Видимість</span>
              <span className={styles.zoneInfoValue}>{selectedZone.is_friends_only ? 'Тільки друзі' : 'Для всіх'}</span>
            </div>

            <p className={styles.ongoingParticipantsTitle}>Учасники</p>
            <div className={styles.ongoingParticipantsList}>
              {(!selectedZone.participants || selectedZone.participants.length === 0) ? (
                <div className={styles.emptyState}>Поки що ніхто не приєднався</div>
              ) : (
                selectedZone.participants.map((p) => (
                  <Link className={styles.ongoingParticipant} key={p.id} to={`/profile/${p.id}`}>
                    {p.avatar ? (
                      <img src={p.avatar} alt="" className={styles.ongoingParticipantAvatarImg} />
                    ) : (
                      <span className={styles.ongoingParticipantAvatar}>
                        {p.username?.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className={styles.ongoingParticipantName}>{p.username}</span>
                  </Link>
                ))
              )}
            </div>

            <button
              type="button"
              className={styles.leaveBtn}
              onClick={() => handleHideZone(selectedZone)}
            >
              Приховати
            </button>
          </div>
        ) : (
          <>
            <p className={styles.heroText}>
              Радіус 5 км. Приєднуйся до когось поруч або чекай, поки хтось приєднається до тебе.
            </p>

            <div className={styles.userList} key={sheetState}>
              {nearbyUsersFiltered.length === 0 ? (
                <div className={styles.emptyState}>
                  {friendsOnly
                    ? 'Немає друзів поруч. Спробуй вимкнути фільтр.'
                    : 'Поки що нікого поруч немає. Спробуй вийти на вулицю — карта оновиться сама.'}
                </div>
              ) : (
                nearbyUsersFiltered.map((person) => (
                  <Link className={styles.userCard} key={person.id} to={`/profile/${person.id}`}>
                    {person.avatar ? (
                      <img src={person.avatar} alt="" className={styles.userAvatarImg} />
                    ) : (
                      <div className={styles.userAvatar}>{person.username?.slice(0, 1).toUpperCase()}</div>
                    )}
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

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
