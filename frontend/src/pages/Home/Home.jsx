import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { getFriends } from '../../api/friends';
import MapView from '../../components/Map/MapView';
import useActivitySocket from '../../hooks/useActivitySocket';
import useZoneSocket from '../../hooks/useZoneSocket';
import useElapsedTime from '../../hooks/useElapsedTime';
import { haversineDistanceKm, formatDistance } from '../../utils/activity';
import TopBar, { ACTIVITIES } from '../../components/TopBar/TopBar';
import BottomSheet from '../../components/BottomSheet/BottomSheet';
import OngoingActivityPanel from '../../components/OngoingActivityPanel/OngoingActivityPanel';
import ZonePanel from '../../components/ZonePanel/ZonePanel';
import NearbyUsersList from '../../components/NearbyUsersList/NearbyUsersList';
import styles from './Home.module.css';
// formLoading is a sheet-content style, so it lives in BottomSheet's module.
import sheetStyles from '../../components/BottomSheet/BottomSheet.module.css';

const ActivityForm = lazy(() => import('../../components/ActivityForm/ActivityForm'));
const CrossActivityForm = lazy(() => import('../../components/CrossActivityForm/CrossActivityForm'));
const GameZoneForm = lazy(() => import('../../components/GameZoneForm/GameZoneForm'));
const QuestActivityForm = lazy(() => import('../../components/QuestActivityForm/QuestActivityForm'));

// Drag distance (px) needed to trigger a state change when releasing the sheet.
const COLLAPSE_THRESHOLD = 60;
const EXPAND_THRESHOLD = 40;

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
  const { deletedZoneIds } = useZoneSocket();

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
  const pillsRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const pillsScrollingRef = useRef(false);

  const handlePillsScroll = useCallback(() => {
    const el = pillsRef.current;
    if (!el || pillsScrollingRef.current) return;
    const half = el.scrollWidth / 2;
    let reset = 0;
    if (el.scrollLeft >= half) {
      reset = -half;
    } else if (el.scrollLeft <= 0) {
      reset = half;
    }
    if (reset !== 0) {
      pillsScrollingRef.current = true;
      el.scrollLeft += reset;
      requestAnimationFrame(() => { pillsScrollingRef.current = false; });
    }
  }, []);

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
    if (activeActivity) {
      setIsClosing(true);
      setSheetState('collapsed');
      setTimeout(() => {
        setActiveActivityId(null);
        setIsClosing(false);
      }, 280);
      return;
    }
    if (ongoingActivity && !isCreator) return;
    if (hasDragged.current) return;
    setSheetState((prev) => (prev === 'collapsed' ? 'expanded' : 'collapsed'));
  };

  const handleHeaderMenuToggle = () => {
    if (activeActivity) {
      setIsClosing(true);
      setSheetState('collapsed');
      setTimeout(() => { setActiveActivityId(null); setIsClosing(false); }, 280);
    } else {
      setSheetState('collapsed');
    }
  };

  const handleSidebarMenuToggle = () => {
    if (activeActivity) {
      setIsClosing(true);
      setSheetState('collapsed');
      setTimeout(() => { setActiveActivityId(null); setIsClosing(false); }, 1000);
    } else {
      setSheetState('collapsed');
    }
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
    () => activeZones.filter((z) => !hiddenZoneIds.has(z.id) && !deletedZoneIds.has(z.id)),
    [activeZones, hiddenZoneIds, deletedZoneIds]
  );

  const handleZoneClick = (zone) => {
    setSelectedZone(zone);
    setSheetState('expanded');
  };

  const handleHideZone = async (zone) => {
    setHiddenZoneIds((prev) => new Set([...prev, zone.id]));
    setSelectedZone(null);
    setSheetState('collapsed');
    try {
      await api.post(`/activities/${zone.id}/hide/`);
    } catch {
      // ignore
    }
  };

  const isZoneCreator = selectedZone && user && selectedZone.creator?.id === user.id;
  const [deleting, setDeleting] = useState(false);

  const handleDeleteZone = async (zone) => {
    setDeleting(true);
    setActiveZones((prev) => prev.filter((z) => z.id !== zone.id));
    setSelectedZone(null);
    setSheetState('collapsed');
    try {
      await api.delete(`/activities/${zone.id}/`);
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
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
          const zones = Array.isArray(data) ? data : (data.zones || []);
          const serverHiddenIds = data.hidden_ids || [];
          setActiveZones(zones);
          if (serverHiddenIds.length > 0) {
            setHiddenZoneIds((prev) => {
              const next = new Set(prev);
              serverHiddenIds.forEach((id) => next.add(id));
              return next;
            });
          }
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

  const handleDeleteActivity = async () => {
    if (!ongoingActivity?.id || leaving) return;
    setLeaving(true);
    setOngoingActivity(null);
    setHideNonParticipants(false);
    setSheetState('collapsed');
    try {
      await api.delete(`/activities/${ongoingActivity.id}/`);
    } catch {
      // ignore
    } finally {
      setLeaving(false);
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

  const filterLabel = hideNonParticipants && friendsOnly
    ? 'Друзі · Учасники'
    : hideNonParticipants
      ? 'Учасники'
      : friendsOnly
        ? 'Лише друзі'
        : null;

  return (
    <div className={styles.screen}>
      <TopBar
        user={user}
        position={position}
        togglingVisibility={togglingVisibility}
        hasActivity={hasActivity}
        hideNonParticipants={hideNonParticipants}
        visibleOnMap={visibleOnMap}
        friendsOnly={friendsOnly}
        activeActivityId={activeActivityId}
        canCreateActivity={canCreateActivity}
        pillsRef={pillsRef}
        onPillsScroll={handlePillsScroll}
        onPillClick={handlePillClick}
        onHeaderMenuToggle={handleHeaderMenuToggle}
        onSidebarMenuToggle={handleSidebarMenuToggle}
        onRecenter={recenterToMe}
        onToggleVisibility={toggleVisibility}
        onToggleFriendsOnly={() => setFriendsOnly((prev) => !prev)}
      />

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

      <BottomSheet
        sheetRef={sheetRef}
        sheetState={sheetState}
        isDragging={isDragging}
        isClosing={isClosing}
        hasActiveActivity={!!activeActivity}
        activeActivityLabel={activeActivity?.label}
        ongoingActivity={ongoingActivity}
        ongoingElapsed={ongoingElapsed}
        ongoingDistanceLabel={ongoingDistanceLabel}
        ongoingParticipantsCount={ongoingParticipantsCount}
        selectedZone={selectedZone}
        nearbyCount={nearbyCount}
        filterLabel={filterLabel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onHeaderClick={handleHeaderClick}
        onZoneBack={() => { setSelectedZone(null); setSheetState('collapsed'); }}
        onScrimClick={() => setSheetState('collapsed')}
      >
        {activeActivity ? (
          <Suspense fallback={<div className={sheetStyles.formLoading}>Завантаження форми…</div>}>
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
            ) : activeActivity.id === 'quest' ? (
              <QuestActivityForm
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
          <OngoingActivityPanel
            ongoingActivity={ongoingActivity}
            ongoingElapsed={ongoingElapsed}
            isCreator={isCreator}
            leaving={leaving}
            onLeave={handleLeaveActivity}
            onDelete={handleDeleteActivity}
          />
        ) : selectedZone ? (
          <ZonePanel
            selectedZone={selectedZone}
            isZoneCreator={isZoneCreator}
            deleting={deleting}
            onHide={() => handleHideZone(selectedZone)}
            onDelete={() => handleDeleteZone(selectedZone)}
          />
        ) : (
          <NearbyUsersList
            nearbyUsersFiltered={nearbyUsersFiltered}
            friendsOnly={friendsOnly}
            sheetState={sheetState}
          />
        )}
      </BottomSheet>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
