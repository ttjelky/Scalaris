import { forwardRef, useEffect, useRef, useState } from 'react';
import { MapContainer, Circle, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import styles from './MapView.module.css';

// Small CSS dot markers instead of the default leaflet pin (which needs
// bundler-specific asset handling and was rendering broken under Vite).
const ownIcon = L.divIcon({
  className: `leaflet-dot-icon ${styles.ownMarker}`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const PERSON_AVATAR_SIZE = 26;
const ACCEPTED_AVATAR_SIZE = 30;

// Builds a divIcon showing the person's avatar photo instead of a plain
// dot. If there's no avatar URL, or the image fails to load (broken link,
// offline, etc.), it falls back to a circle with the first letter of the
// username — same pattern as the fallback in Profile.jsx. The onerror is
// inlined since divIcon content lives outside React's tree.
function makePersonIcon(person, isAccepted) {
  const size = isAccepted ? ACCEPTED_AVATAR_SIZE : PERSON_AVATAR_SIZE;
  const ringClass = isAccepted ? styles.personAvatarAccepted : '';
  const initial = escapeHtml((person.username || '?').slice(0, 1).toUpperCase());
  const fallback = `<span class="${styles.personAvatarFallback}">${initial}</span>`;
  const avatarUrl = person.avatar ? escapeHtml(person.avatar) : null;

  const html = avatarUrl
    ? `<div class="${styles.personAvatarWrap} ${ringClass}">
         <img src="${avatarUrl}" class="${styles.personAvatarImg}" alt=""
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
         <span class="${styles.personAvatarFallback}" style="display:none">${initial}</span>
       </div>`
    : `<div class="${styles.personAvatarWrap} ${ringClass}">${fallback}</div>`;

  return L.divIcon({
    className: 'leaflet-avatar-icon',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const CLUSTER_SIZE = 34;

// Builds a divIcon for a group of people who are standing too close
// together on screen to show as separate avatars — a count badge instead
// of a photo. Rings accent-colored if anyone inside accepted the gathering.
function makeClusterIcon(count, hasAccepted) {
  const ringClass = hasAccepted ? styles.clusterAccepted : '';
  return L.divIcon({
    className: 'leaflet-cluster-icon',
    html: `<div class="${styles.clusterMarker} ${ringClass}">${count}</div>`,
    iconSize: [CLUSTER_SIZE, CLUSTER_SIZE],
    iconAnchor: [CLUSTER_SIZE / 2, CLUSTER_SIZE / 2],
  });
}

// How close two people need to be on screen (in pixels, not meters) before
// they're folded into one cluster marker. Pixel-based rather than
// distance-based on purpose: at low zoom lots of real-world meters map to
// a few screen pixels, so the "are these dots overlapping" question is
// inherently a screen-space one, and it naturally re-splits as you zoom in.
const CLUSTER_PIXEL_RADIUS = 28;

// Greedy single-link grouping: walk the list, and any not-yet-used point
// within radiusPx of the current seed joins its group. Good enough for a
// few dozen nearby users — no need for a full clustering library here.
function clusterPeople(map, people, radiusPx) {
  const points = people.map((person) => ({
    person,
    pt: map.latLngToContainerPoint([person.latitude, person.longitude]),
  }));

  const used = new Array(points.length).fill(false);
  const groups = [];

  for (let i = 0; i < points.length; i += 1) {
    if (used[i]) continue;
    used[i] = true;
    const group = [points[i]];

    for (let j = i + 1; j < points.length; j += 1) {
      if (used[j]) continue;
      const dx = points[i].pt.x - points[j].pt.x;
      const dy = points[i].pt.y - points[j].pt.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radiusPx) {
        used[j] = true;
        group.push(points[j]);
      }
    }

    groups.push(group);
  }

  return groups;
}

// The gathering point itself — bigger, pulsing, visually distinct from
// both "me" and "other people" dots.
const gatheringIcon = L.divIcon({
  className: `leaflet-dot-icon ${styles.gatheringMarker}`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const INITIAL_ZOOM = 14;
// Below this zoom level, dots are packed close together and a nickname
// per marker would just clutter the map — labels only kick in once
// there's enough space between points to actually read them.
const LABEL_ZOOM_THRESHOLD = 15;

// Auto-centers the map exactly once — when the very first GPS fix comes
// in. `position` keeps updating every few seconds from watchPosition, but
// re-centering on every one of those ticks was yanking the map back mid-
// drag on mobile, making it impossible to pan around. Manual re-centering
// afterwards is handled by the "show my location" button (see recenterToMe
// in Home.jsx), which drives the map ref directly.
function RecenterOnMove({ position }) {
  const map = useMap();
  const hasCenteredOnce = useRef(false);

  useEffect(() => {
    if (!position || hasCenteredOnce.current) return;
    hasCenteredOnce.current = true;
    map.setView(position, map.getZoom(), { animate: true });
  }, [position, map]);

  return null;
}

// Not rendered — just listens for zoom changes and reports them up, so
// MapView can decide whether nickname labels should be visible.
function ZoomWatcher({ onZoomChange }) {
  useMapEvents({
    zoomend: (e) => onZoomChange(e.target.getZoom()),
  });
  return null;
}

// Small avatar used inside the cluster popup list — same fallback pattern
// as the map markers (initial letter if there's no photo or it fails to
// load), but as a normal React element since popup content lives inside
// React's tree, unlike the divIcon HTML strings above.
function ClusterPopupAvatar({ person }) {
  const [broken, setBroken] = useState(false);
  const initial = (person.username || '?').slice(0, 1).toUpperCase();

  if (!person.avatar || broken) {
    return (
      <span className={styles.clusterPopupAvatarFallback}>{initial}</span>
    );
  }

  return (
    <img
      src={person.avatar}
      alt=""
      className={styles.clusterPopupAvatarImg}
      onError={() => setBroken(true)}
    />
  );
}

// Renders nearbyUsers as either single avatar markers (unchanged behavior)
// or, when several people are close enough together on screen to overlap,
// as one cluster marker showing a count. Clicking a cluster opens a popup
// listing everyone in that spot instead of trying to show every avatar.
// Clusters are recomputed on pan/zoom (screen-space distance depends on
// both) and whenever the underlying people list changes.
function ClusterLayer({ people, acceptedIds, showLabels, onSelectPerson }) {
  const map = useMap();
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    const recompute = () => setGroups(clusterPeople(map, people, CLUSTER_PIXEL_RADIUS));
    recompute();
    map.on('zoomend', recompute);
    map.on('moveend', recompute);
    return () => {
      map.off('zoomend', recompute);
      map.off('moveend', recompute);
    };
  }, [map, people]);

  return groups.map((group) => {
    if (group.length === 1) {
      const { person } = group[0];
      const isAccepted = acceptedIds.includes(person.id);
      return (
        <Marker
          key={person.id}
          position={[person.latitude, person.longitude]}
          icon={makePersonIcon(person, isAccepted)}
          eventHandlers={{ click: () => onSelectPerson(person) }}
        >
          {showLabels && (
            <Tooltip permanent direction="top" offset={[0, -12]} className="map-user-label">
              {person.username}
            </Tooltip>
          )}
        </Marker>
      );
    }

    const clusterId = group
      .map(({ person }) => person.id)
      .sort()
      .join('-');
    const centerLat = group.reduce((sum, { person }) => sum + person.latitude, 0) / group.length;
    const centerLng = group.reduce((sum, { person }) => sum + person.longitude, 0) / group.length;
    const hasAccepted = group.some(({ person }) => acceptedIds.includes(person.id));

    return (
      <Marker
        key={clusterId}
        position={[centerLat, centerLng]}
        icon={makeClusterIcon(group.length, hasAccepted)}
      >
        <Popup className={styles.clusterPopup} closeButton={false}>
          <div className={styles.clusterPopupList}>
            {group.map(({ person }) => (
              <button
                key={person.id}
                type="button"
                className={styles.clusterPopupItem}
                onClick={() => onSelectPerson(person)}
              >
                <span
                  className={`${styles.clusterPopupAvatarWrap} ${
                    acceptedIds.includes(person.id) ? styles.personAvatarAccepted : ''
                  }`}
                >
                  <ClusterPopupAvatar person={person} />
                </span>
                <span className={styles.clusterPopupName}>{person.username}</span>
              </button>
            ))}
          </div>
        </Popup>
      </Marker>
    );
  });
}

// Small floating card shown when a name is tapped in a cluster popup — just
// the avatar, the username, and a way to jump to their full profile. Sits
// above the map itself (rendered as a sibling of MapContainer, not inside
// it) so it isn't clipped by Leaflet's panes or tied to marker positioning.
function ProfileMiniCard({ person, onClose, onViewProfile }) {
  const [broken, setBroken] = useState(false);
  const initial = (person.username || '?').slice(0, 1).toUpperCase();

  return (
    <div className={styles.profileCardBackdrop} onClick={onClose}>
      <div className={styles.profileCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.profileCardAvatarWrap}>
          {person.avatar && !broken ? (
            <img
              src={person.avatar}
              alt=""
              className={styles.profileCardAvatarImg}
              onError={() => setBroken(true)}
            />
          ) : (
            <span className={styles.profileCardAvatarFallback}>{initial}</span>
          )}
        </div>
        <div className={styles.profileCardName}>{person.username}</div>
        <button
          type="button"
          className={styles.profileCardButton}
          onClick={() => {
            onViewProfile?.(person);
            onClose();
          }}
        >
          Перейти в профіль
        </button>
      </div>
    </div>
  );
}

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
//
// `onViewProfile` (optional): called with a person object when someone taps
// "Перейти в профіль" on the mini profile card opened from a cluster popup.
// Left to the caller since navigation (route, modal, etc.) is app-specific.
const MapView = forwardRef(function MapView({ position, nearbyUsers, gathering, zones, onZoneClick, className, onViewProfile }, ref) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const showLabels = zoom >= LABEL_ZOOM_THRESHOLD;
  const acceptedIds = gathering?.acceptedIds || [];
  const [profilePerson, setProfilePerson] = useState(null);

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

        {(zones || []).map((zone) => (
          <Circle
            key={zone.id}
            center={[zone.latitude, zone.longitude]}
            radius={zone.radius || 80}
            pathOptions={{
              color: '#c6ff3d',
              fillColor: '#c6ff3d',
              fillOpacity: 0.15,
              weight: 2,
            }}
            eventHandlers={{
              click: () => onZoneClick?.(zone),
            }}
          />
        ))}

      {gathering && gathering.category === 'zone' ? (
        <Circle
          center={gathering.point}
          radius={gathering.radius || 80}
          pathOptions={{
            color: '#c6ff3d',
            fillColor: '#c6ff3d',
            fillOpacity: 0.15,
            weight: 2,
          }}
        />
      ) : gathering ? (
        <Marker position={gathering.point} icon={gatheringIcon}>
          <Tooltip permanent direction="top" offset={[0, -16]} className="map-gathering-label">
            {gathering.title || 'Збір'}
          </Tooltip>
        </Marker>
      ) : null}

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
