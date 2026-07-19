import { PARTICIPANT_STATUS } from '../../utils/activity';
import styles from '../BottomSheet/BottomSheet.module.css';

export default function ZonePanel({ selectedZone, isZoneCreator, deleting, onHide, onDelete }) {
  const participants = selectedZone.participants || [];

  return (
    <div className={styles.ongoingWrap}>
      {selectedZone.description && (
        <p className={styles.heroText}>{selectedZone.description}</p>
      )}

      <p className={styles.ongoingParticipantsTitle}>Учасники</p>
      <div className={styles.ongoingParticipantsList}>
        {participants.length === 0 ? (
          <div className={styles.emptyState}>Немає учасників</div>
        ) : (
          participants.map((p) => {
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

      {isZoneCreator ? (
        <>
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

          <button
            type="button"
            className={styles.leaveBtn}
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? 'Видаляємо…' : 'Видалити зону'}
          </button>
        </>
      ) : (
        <button type="button" className={styles.leaveBtn} onClick={onHide}>
          Приховати
        </button>
      )}
    </div>
  );
}
