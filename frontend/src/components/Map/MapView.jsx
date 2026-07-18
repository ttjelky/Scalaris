import { forwardRef, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import styles from './MapView.module.css';
import { ownIcon } from './icons';
import { RecenterOnMove, ZoomWatcher } from './MapControls';
import ZonesLayer from './ZonesLayer';
import GatheringLayer from './GatheringLayer';
import CheckpointLayer from './CheckpointLayer';
import ClusterLayer from './ClusterLayer';
import ProfileMiniCard from './ProfileMiniCard';

const INITIAL_ZOOM = 14;
// Below this zoom level, dots are packed close together and a nickname
// per marker would just clutter the map — labels only kick in once
// there's enough space between points to actually read them.
const LABEL_ZOOM_THRESHOLD = 15;

// `ref` is forwarded straight onto react-leaflet's MapContainer, so callers
// keep using it exactly as before (e.g. mapRef.current.setView(...)).
//
// `gathering` (optional): { point: [lat, lng], title, acceptedIds } for the
// currently ongoing "Збір". When present, shows the gathering point, a road
// route from `position` to it, and highlights nearbyUsers whose id is in
// acceptedIds.
//
// `zones` (optional): array of zone objects visible to everyone on the map.
//
// `onZoneClick` (optional): called with a zone object when a zone circle is clicked.
// `checkpoints` (optional): { items, currentId, passedIds, userPosition }
// For cross activities — shows all checkpoints as numbered markers on the
// map, highlights the current one, and draws a route from the user to it.
//
// `onViewProfile` (optional): called with a person object when someone taps
// "Перейти в профіль" on the mini profile card opened from a cluster popup.
// Left to the caller since navigation (route, modal, etc.) is app-specific.
const MapView = forwardRef(function MapView({ position, nearbyUsers, gathering, checkpoints, zones, onZoneClick, className, onViewProfile }, ref) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const showLabels = zoom >= LABEL_ZOOM_THRESHOLD;
  const acceptedIds = gathering?.acceptedIds || [];
  const [profilePerson, setProfilePerson] = useState(null);

  const cpItems = useMemo(() => checkpoints?.items || [], [checkpoints]);
  const cpCurrentId = checkpoints?.currentId || null;
  const cpPassedIds = useMemo(() => checkpoints?.passedIds || [], [checkpoints]);
  const cpUserPosition = checkpoints?.userPosition || position;

  return (
    <div className={styles.mapWrapper}>
      <MapContainer
        ref={ref}
        center={position}
        zoom={INITIAL_ZOOM}
        zoomControl={false}
        className={className || styles.map}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <ZoomWatcher onZoomChange={setZoom} />
        <Marker position={position} icon={ownIcon} />

        <ZonesLayer zones={zones} onZoneClick={onZoneClick} />

        <GatheringLayer gathering={gathering} position={position} />

        {cpItems.length > 0 && (
          <CheckpointLayer
            checkpoints={cpItems}
            currentCheckpointId={cpCurrentId}
            passedCheckpointIds={cpPassedIds}
            userPosition={cpUserPosition}
          />
        )}

        <ClusterLayer
          people={nearbyUsers}
          acceptedIds={acceptedIds}
          showLabels={showLabels}
          onSelectPerson={setProfilePerson}
        />
        <RecenterOnMove position={position} />
      </MapContainer>

      {profilePerson && (
        <ProfileMiniCard
          person={profilePerson}
          onClose={() => setProfilePerson(null)}
          onViewProfile={onViewProfile}
        />
      )}
    </div>
  );
});

export default MapView;
