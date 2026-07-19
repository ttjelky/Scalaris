import { formatClock } from '../../utils/activity';
import styles from './BottomSheet.module.css';

// The draggable bottom sheet shell: scrim, collapse/expand hero header (4
// variants depending on what's active), and a slot for whatever body content
// Home decides to render below it (activity form / ongoing activity /
// selected zone / nearby users list).
//
// NOTE: OngoingActivityPanel, ZonePanel and NearbyUsersList import their
// classes (heroText, userList, ongoingWrap, leaveBtn, etc.) from this same
// BottomSheet.module.css rather than their own stylesheets. That's because
// several rules here key off ancestor state defined in this file (e.g.
// ".sheetCollapsed .heroText" or ".sheetDragging .userList"), and CSS
// Modules only match those selectors when both sides come from the same
// compiled module. Splitting them into separate files would silently break
// the collapse/expand animations.
export default function BottomSheet({
  sheetRef,
  sheetState,
  isDragging,
  isClosing,
  hasActiveActivity,
  activeActivityLabel,
  ongoingActivity,
  ongoingElapsed,
  ongoingDistanceLabel,
  ongoingParticipantsCount,
  selectedZone,
  zoneParticipantsCount,
  nearbyCount,
  filterLabel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onHeaderClick,
  onZoneBack,
  onScrimClick,
  children,
}) {
  const sheetClassName = [
    styles.sheet,
    !isClosing && sheetState === 'collapsed' && styles.sheetCollapsed,
    isDragging && styles.sheetDragging,
    isClosing && styles.sheetClosing,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div
        className={`${styles.scrim} ${sheetState === 'expanded' ? styles.scrimVisible : ''}`}
        onClick={() => !hasActiveActivity && onScrimClick()}
        aria-hidden="true"
      />

      {filterLabel && sheetState !== 'expanded' && (
        <span className={styles.filterBadge}>{filterLabel}</span>
      )}

      <div ref={sheetRef} className={sheetClassName}>
        <div
          className={styles.sheetHeader}
          role="button"
          tabIndex={0}
          aria-expanded={sheetState === 'expanded'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={onHeaderClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onHeaderClick();
            }
          }}
        >
          <div className={styles.sheetHandle} aria-hidden="true" />

          <div className={styles.heroRow}>
            {hasActiveActivity ? (
              <div className={styles.heroTitleBlock}>
                <h1 className={styles.heroTitle}>{activeActivityLabel}</h1>
              </div>
            ) : ongoingActivity ? (
              <>
                <div className={styles.heroRowParticipants}>
                  <div
                    className={styles.heroParticipantsCircle}
                    aria-label={`Учасників у зборі: ${ongoingParticipantsCount}`}
                  >
                    {ongoingParticipantsCount}
                  </div>
                  <span className={styles.heroRowParticipantsLabel}>учасник</span>
                </div>
                <div className={styles.heroTitleBlock}>
                  <h1 className={styles.heroTitle}>{ongoingActivity.title || 'Збір'}</h1>
                  {ongoingDistanceLabel && (
                    <p className={styles.heroDistance}>{ongoingDistanceLabel}</p>
                  )}
                </div>
                <div className={styles.heroBadgeBlock}>
                  <div className={styles.heroBadge}>
                    <span className={`${styles.heroBadgeValue} ${styles.heroBadgeValueClock}`}>
                      {ongoingActivity.category === 'cross' && ongoingActivity.duration_seconds
                        ? formatClock(Math.max(0, ongoingActivity.duration_seconds * 1000 - ongoingElapsed))
                        : formatClock(ongoingElapsed)}
                    </span>
                  </div>
                  <span className={styles.heroBadgeLabel}>
                    {ongoingActivity.category === 'cross' && ongoingActivity.duration_seconds ? 'залишилось' : 'триває'}
                  </span>
                </div>
              </>
            ) : selectedZone ? (
              <>
                <div className={styles.heroRowParticipants}>
                  <div
                    className={styles.heroParticipantsCircle}
                    aria-label={`Учасників у зоні: ${zoneParticipantsCount}`}
                  >
                    {zoneParticipantsCount}
                  </div>
                  <span className={styles.heroRowParticipantsLabel}>учасник</span>
                </div>
                <div className={styles.heroTitleBlock}>
                  <h1 className={styles.heroTitle}>{selectedZone.title}</h1>
                  <p className={styles.heroDistance}>Радіус: {selectedZone.radius || 80} м</p>
                </div>
                <button
                  type="button"
                  className={styles.sheetBackBtn}
                  onClick={(e) => { e.stopPropagation(); onZoneBack(); }}
                  aria-label="Закрити"
                >
                  ←
                </button>
              </>
            ) : (
              <>
                <div className={styles.heroTitleBlockLeft}>
                  <p className={styles.kicker}>Твоя зона активності</p>
                  <h1 className={styles.heroTitle}>Люди поруч</h1>
                </div>
                <div className={styles.heroBadgeBlock}>
                  <div className={styles.heroBadge}>
                    <span key={nearbyCount} className={styles.heroBadgeValue}>
                      {nearbyCount}
                    </span>
                  </div>
                  <span className={styles.heroBadgeLabel}>поруч</span>
                </div>
              </>
            )}
          </div>
        </div>

        {children}
      </div>
    </>
  );
}
