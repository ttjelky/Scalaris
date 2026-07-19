import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import MapView from '../../components/Map/MapView';
import useZoneSocket from '../../hooks/useZoneSocket';
import TopBar, { ACTIVITIES } from '../../components/TopBar/TopBar';
import BottomSheet from '../../components/BottomSheet/BottomSheet';
import styles from './Home.module.css';

import useGeoTracking from './hooks/useGeoTracking';
import useZonePanel from './hooks/useZonePanel';
import useOngoingActivity from './hooks/useOngoingActivity';
import useFriendsFilter from './hooks/useFriendsFilter';
import useBottomSheetDrag from './hooks/useBottomSheetDrag';
import HomeSheetContent from './HomeSheetContent';

export default function Home() {
  const { user, updateUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef(null);

  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [toast, setToast] = useState(null);
  const [nearbyActivities, setNearbyActivities] = useState([]);
  const [hideNonParticipants, setHideNonParticipants] = useState(false);

  const [activeActivityId, setActiveActivityId] = useState(null);

  const [sheetState, setSheetState] = useState('collapsed');

  const {
    position,
    error,
    loading,
    nearbyUsers,
    activeZones,
    setActiveZones,
    hiddenZoneIds,
    setHiddenZoneIds,
  } = useGeoTracking(isAuthenticated);

  const { deletedZoneIds } = useZoneSocket();

  const activeActivity = useMemo(
    () => ACTIVITIES.find((a) => a.id === activeActivityId) || null,
    [activeActivityId]
  );

  const {
    ongoingActivity,
    setOngoingActivity,
    ongoingElapsed,
    isCreator,
    leaving,
    ongoingDistanceLabel,
    ongoingParticipantsCount,
    gatheringMapData,
    checkpointsMapData,
    handleLeaveActivity,
    handleDeleteActivity,
  } = useOngoingActivity({ user, position, setSheetState, setHideNonParticipants });

  const {
    friendsOnly,
    setFriendsOnly,
    nearbyUsersFiltered,
    nearbyCount,
    filterLabel,
  } = useFriendsFilter({ nearbyUsers, ongoingActivity, hideNonParticipants });

  const {
    selectedZone,
    setSelectedZone,
    visibleZones,
    isZoneCreator,
    zoneParticipantsCount,
    deleting: deletingZone,
    handleZoneClick,
    handleHideZone,
    handleDeleteZone,
  } = useZonePanel({
    activeZones,
    setActiveZones,
    hiddenZoneIds,
    setHiddenZoneIds,
    deletedZoneIds,
    user,
    setSheetState,
  });

  const handleCancelCreate = () => setActiveActivityId(null);

  const {
    isDragging,
    isClosing,
    sheetRef,
    pillsRef,
    handlePillsScroll,
    handlePointerDown,
    handlePointerMove,
    finishDrag,
    handleHeaderClick,
    handleHeaderMenuToggle,
    handleSidebarMenuToggle,
  } = useBottomSheetDrag({
    sheetState,
    setSheetState,
    activeActivity,
    onCloseActiveForm: handleCancelCreate,
  });

  const canCreateActivity = !ongoingActivity;

  const handlePillClick = (activity) => {
    if (!canCreateActivity) return;
    setSelectedZone(null);
    setActiveActivityId(activity.id);
    setSheetState('expanded');
  };

  const handleViewProfile = (person) => {
    navigate(`/profile/${person.id}`);
  };

  const recenterToMe = () => {
    if (position && mapRef.current) {
      try {
        mapRef.current.setView(position, mapRef.current.getZoom(), { animate: true });
      } catch {
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
    updateUser({ is_visible_on_map: next });
    setTogglingVisibility(true);
    try {
      await api.patch('/users/me/', { is_visible_on_map: next });
    } catch {
      updateUser({ is_visible_on_map: !next });
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleActivityCreated = async (activity) => {
    setActiveActivityId(null);
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
        // ignore
      }
    }
  };

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
        zoneParticipantsCount={zoneParticipantsCount}
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
        <HomeSheetContent
          activeActivity={activeActivity}
          position={position}
          nearbyUsers={nearbyUsers}
          onCancelCreate={handleCancelCreate}
          onActivityCreated={handleActivityCreated}
          ongoingActivity={ongoingActivity}
          ongoingElapsed={ongoingElapsed}
          isCreator={isCreator}
          leaving={leaving}
          onLeaveActivity={handleLeaveActivity}
          onDeleteActivity={handleDeleteActivity}
          selectedZone={selectedZone}
          isZoneCreator={isZoneCreator}
          deletingZone={deletingZone}
          onHideZone={() => handleHideZone(selectedZone)}
          onDeleteZone={() => handleDeleteZone(selectedZone)}
          nearbyUsersFiltered={nearbyUsersFiltered}
          friendsOnly={friendsOnly}
          sheetState={sheetState}
        />
      </BottomSheet>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
