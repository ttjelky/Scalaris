// Shares BottomSheet's stylesheet — see the note at the top of
// BottomSheet.jsx for why these classes aren't split into their own file.
import styles from '../BottomSheet/BottomSheet.module.css';

export default function ZonePanel({ selectedZone, isZoneCreator, deleting, onHide, onDelete }) {
  return (
    <div className={styles.ongoingWrap}>
      {selectedZone.description && (
        <p className={styles.heroText}>{selectedZone.description}</p>
      )}

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
