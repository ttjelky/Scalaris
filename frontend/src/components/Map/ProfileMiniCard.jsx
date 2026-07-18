import { useState } from 'react';

import styles from './ProfileMiniCard.module.css';

// Small floating card shown when a name is tapped in a cluster popup — just
// the avatar, the username, and a way to jump to their full profile. Sits
// above the map itself (rendered as a sibling of MapContainer, not inside
// it, see MapView.jsx) so it isn't clipped by Leaflet's panes or tied to
// marker positioning.
export default function ProfileMiniCard({ person, onClose, onViewProfile }) {
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
