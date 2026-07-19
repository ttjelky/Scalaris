import { useEffect, useState } from 'react';
import { Marker, Popup, Tooltip, useMap } from 'react-leaflet';

import { makeClusterIcon, makePersonIcon } from './icons';
import styles from './ClusterLayer.module.css';

const CLUSTER_PIXEL_RADIUS = 28;

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

export default function ClusterLayer({ people, acceptedIds, showLabels, onSelectPerson }) {
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
