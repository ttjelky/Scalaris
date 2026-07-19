import { lazy, Suspense } from 'react';
import OngoingActivityPanel from '../../components/OngoingActivityPanel/OngoingActivityPanel';
import ZonePanel from '../../components/ZonePanel/ZonePanel';
import NearbyUsersList from '../../components/NearbyUsersList/NearbyUsersList';
import sheetStyles from '../../components/BottomSheet/BottomSheet.module.css';

const ActivityForm = lazy(() => import('../../components/ActivityForm/ActivityForm'));
const CrossActivityForm = lazy(() => import('../../components/CrossActivityForm/CrossActivityForm'));
const GameZoneForm = lazy(() => import('../../components/GameZoneForm/GameZoneForm'));
const QuestActivityForm = lazy(() => import('../../components/QuestActivityForm/QuestActivityForm'));

/**
 * Picks what the bottom sheet shows: the form for the activity currently
 * being created, the ongoing activity panel, the selected zone's panel,
 * or (by default) the nearby-people list.
 */
export default function HomeSheetContent({
  activeActivity,
  position,
  nearbyUsers,
  onCancelCreate,
  onActivityCreated,
  ongoingActivity,
  ongoingElapsed,
  isCreator,
  leaving,
  onLeaveActivity,
  onDeleteActivity,
  selectedZone,
  isZoneCreator,
  deletingZone,
  onHideZone,
  onDeleteZone,
  nearbyUsersFiltered,
  friendsOnly,
  sheetState,
}) {
  if (activeActivity) {
    return (
      <Suspense fallback={<div className={sheetStyles.formLoading}>Завантаження форми…</div>}>
        {activeActivity.id === 'cross' ? (
          <CrossActivityForm
            initialPosition={position}
            nearbyUsers={nearbyUsers}
            onCancel={onCancelCreate}
            onCreated={onActivityCreated}
          />
        ) : activeActivity.id === 'zone' ? (
          <GameZoneForm
            initialPosition={position}
            nearbyUsers={nearbyUsers}
            onCancel={onCancelCreate}
            onCreated={onActivityCreated}
          />
        ) : activeActivity.id === 'quest' ? (
          <QuestActivityForm
            initialPosition={position}
            nearbyUsers={nearbyUsers}
            onCancel={onCancelCreate}
            onCreated={onActivityCreated}
          />
        ) : (
          <ActivityForm
            initialPosition={position}
            nearbyUsers={nearbyUsers}
            onCancel={onCancelCreate}
            onCreated={onActivityCreated}
          />
        )}
      </Suspense>
    );
  }

  if (ongoingActivity) {
    return (
      <OngoingActivityPanel
        ongoingActivity={ongoingActivity}
        ongoingElapsed={ongoingElapsed}
        isCreator={isCreator}
        leaving={leaving}
        onLeave={onLeaveActivity}
        onDelete={onDeleteActivity}
      />
    );
  }

  if (selectedZone) {
    return (
      <ZonePanel
        selectedZone={selectedZone}
        isZoneCreator={isZoneCreator}
        deleting={deletingZone}
        onHide={onHideZone}
        onDelete={onDeleteZone}
      />
    );
  }

  return (
    <NearbyUsersList
      nearbyUsersFiltered={nearbyUsersFiltered}
      friendsOnly={friendsOnly}
      sheetState={sheetState}
    />
  );
}
