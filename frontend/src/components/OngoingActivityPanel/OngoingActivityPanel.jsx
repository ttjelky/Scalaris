import { formatDurationLong, PARTICIPANT_STATUS } from '../../utils/activity';
// Shares BottomSheet's stylesheet — see the note at the top of
// BottomSheet.jsx for why these classes aren't split into their own file.
import styles from '../BottomSheet/BottomSheet.module.css';

export default function OngoingActivityPanel({
  ongoingActivity,
  ongoingElapsed,
  isCreator,
  leaving,
  onLeave,
  onDelete,
}) {
  return (
    <div className={styles.ongoingWrap}>
      {ongoingActivity.category === 'quest' ? (
        <>
          <p className={styles.heroText}>
            {ongoingActivity.duration_seconds ? (
              <>Залишилось {formatDurationLong(Math.max(0, ongoingActivity.duration_seconds * 1000 - ongoingElapsed))}.</>
            ) : (
              <>Квест триває вже {formatDurationLong(ongoingElapsed)}.</>
            )}
          </p>

          {(() => {
            const sorted = [...(ongoingActivity.participants || [])]
              .sort((a, b) => (b.distance_km || 0) - (a.distance_km || 0));
            const medals = ['🥇', '🥈', '🥉'];
            const hasAnyDistance = sorted.some((p) => p.distance_km > 0);
            return hasAnyDistance ? (
              <>
                <p className={styles.ongoingParticipantsTitle}>Таблиця лідерів</p>
                <div className={styles.questLeaderboard}>
                  {sorted.map((p, i) => (
                    <div
                      key={p.id}
                      className={`${styles.questLeaderRow} ${i < 3 ? styles[`questPlace${i + 1}`] : ''}`}
                    >
                      <span className={styles.questPlace}>{medals[i] || `${i + 1}`}</span>
                      {p.avatar ? (
                        <img src={p.avatar} alt="" className={styles.questLeaderAvatar} />
                      ) : (
                        <span className={styles.questLeaderAvatarFallback}>
                          {p.username?.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className={styles.questLeaderName}>{p.username}</span>
                      <span className={styles.questLeaderKm}>
                        {(p.distance_km || 0).toFixed(2)} км
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className={styles.heroText}>Учасники в дорозі — ніхто ще не пройшов жодного кілометру.</p>
            );
          })()}
        </>
      ) : ongoingActivity.category === 'cross' ? (
        <>
          <p className={styles.heroText}>
            {ongoingActivity.duration_seconds ? (
              <>Залишилось {formatDurationLong(Math.max(0, ongoingActivity.duration_seconds * 1000 - ongoingElapsed))}.</>
            ) : (
              <>Крос триває вже {formatDurationLong(ongoingElapsed)}.</>
            )}
          </p>

          <p className={styles.ongoingParticipantsTitle}>Прогрес</p>
          <div className={styles.checkpointProgress}>
            {(ongoingActivity.checkpoints || []).map((cp) => {
              const passedByAnyone = (ongoingActivity.participants || []).some(
                (p) => (p.passed_checkpoints || []).includes(cp.id)
              );
              return (
                <div
                  key={cp.id}
                  className={`${styles.checkpointStep} ${passedByAnyone ? styles.checkpointStepPassed : ''}`}
                >
                  <span className={styles.checkpointStepNumber}>{cp.order}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className={styles.heroText}>
          {ongoingActivity.title || 'Збір'} триває вже {formatDurationLong(ongoingElapsed)}.
        </p>
      )}

      <p className={styles.ongoingParticipantsTitle}>Учасники</p>
      <div className={styles.ongoingParticipantsList}>
        {(ongoingActivity.participants || []).length === 0 ? (
          <div className={styles.emptyState}>Немає учасників</div>
        ) : (
          ongoingActivity.participants.map((p) => {
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

      {isCreator ? (
        <button type="button" className={styles.leaveBtn} onClick={onDelete} disabled={leaving}>
          {leaving ? 'Видаляємо…' : 'Видалити'}
        </button>
      ) : (
        <button type="button" className={styles.leaveBtn} onClick={onLeave} disabled={leaving}>
          {leaving ? 'Виходимо…' : 'Вийти'}
        </button>
      )}
    </div>
  );
}
