import L from 'leaflet';

import styles from './icons.module.css';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Small CSS dot marker instead of the default leaflet pin (which needs
// bundler-specific asset handling and was rendering broken under Vite).
export const ownIcon = L.divIcon({
  className: `leaflet-dot-icon ${styles.ownMarker}`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const PERSON_AVATAR_SIZE = 26;
const ACCEPTED_AVATAR_SIZE = 30;

export function makePersonIcon(person, isAccepted) {
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

export function makeClusterIcon(count, hasAccepted) {
  const ringClass = hasAccepted ? styles.clusterAccepted : '';
  return L.divIcon({
    className: 'leaflet-cluster-icon',
    html: `<div class="${styles.clusterMarker} ${ringClass}">${count}</div>`,
    iconSize: [CLUSTER_SIZE, CLUSTER_SIZE],
    iconAnchor: [CLUSTER_SIZE / 2, CLUSTER_SIZE / 2],
  });
}

export const gatheringIcon = L.divIcon({
  className: `leaflet-dot-icon ${styles.gatheringMarker}`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const CHECKPOINT_SIZE = 30;

export function makeCheckpointIcon(order, isCurrent, isPassed) {
  let className = styles.checkpointMarker;
  if (isCurrent) className += ` ${styles.checkpointMarkerCurrent}`;
  else if (isPassed) className += ` ${styles.checkpointMarkerPassed}`;
  return L.divIcon({
    className: 'leaflet-checkpoint-icon',
    html: `<div class="${className}">${order}</div>`,
    iconSize: [CHECKPOINT_SIZE, CHECKPOINT_SIZE],
    iconAnchor: [CHECKPOINT_SIZE / 2, CHECKPOINT_SIZE / 2],
  });
}
