import { Link } from 'react-router-dom';
import Navbar from '../Navbar/Navbar';
import styles from './TopBar.module.css';

// Only one activity type exists for now. Kept as a list so more can be
// added later without reshaping the pill row or the sheet-switching logic.
// Exported so Home can look activities up by id (e.g. to pick which form
// to render, or to read the label of the one currently being created).
export const ACTIVITIES = [
  {
    id: 'gathering',
    label: 'Збір',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 21s-7-6.1-7-11.2C5 5.5 8.1 3 12 3s7 2.5 7 6.8C19 14.9 12 21 12 21z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="9.5" r="2.3" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: 'cross',
    label: 'Крос',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="20" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="20" r="2" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: 'zone',
    label: 'Ігрова зона',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'quest',
    label: 'Квест',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
];

// Renders both the mobile header row (topbar) and the desktop right-hand
// icon column (rightSidebar). Both are always in the DOM; Home.module.css's
// media queries decide which one is actually visible at a given width, so
// the two must stay in sync with each other.
export default function TopBar({
  user,
  position,
  togglingVisibility,
  hasActivity,
  hideNonParticipants,
  visibleOnMap,
  friendsOnly,
  activeActivityId,
  canCreateActivity,
  pillsRef,
  onPillsScroll,
  onPillClick,
  onHeaderMenuToggle,
  onSidebarMenuToggle,
  onRecenter,
  onToggleVisibility,
  onToggleFriendsOnly,
}) {
  return (
    <>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <Navbar onMenuToggle={onHeaderMenuToggle} />
          <Link to="/profile" className={styles.greetingBlock}>
            {user?.avatar ? (
              <img src={user.avatar} alt="" className={styles.greetingAvatar} />
            ) : (
              <span className={styles.greetingAvatarFallback}>{user?.username?.slice(0, 1).toUpperCase()}</span>
            )}
            <span className={styles.greeting}>{user?.username}</span>
          </Link>
          <button
            className={styles.recenterButton}
            onClick={onRecenter}
            type="button"
            disabled={!position}
            aria-label="Показати мою геопозицію"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path
                d="M12 2V5M12 19V22M2 12H5M19 12H22"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className={styles.visibilityButton}
            onClick={onToggleVisibility}
            type="button"
            disabled={togglingVisibility}
            aria-pressed={hasActivity ? hideNonParticipants : visibleOnMap}
            aria-label={hasActivity
              ? (hideNonParticipants ? 'Показати всіх на карті' : 'Приховати не-учасників')
              : (visibleOnMap ? 'Сховати мене з карти' : 'Показати мене на карті')}
            title={hasActivity
              ? (hideNonParticipants ? 'Показати всіх' : 'Тільки учасники')
              : (visibleOnMap ? 'Видимий на карті' : 'Прихований з карти')}
          >
            {hasActivity ? (
              hideNonParticipants ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
                  <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )
            ) : visibleOnMap ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 12C1 12 5 5 12 5C19 5 23 12 23 12C23 12 19 19 12 19C5 19 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.94 17.94C16.23 19.24 14.24 20 12 20C5 20 1 13 1 13C2.24 10.72 3.9 8.87 5.76 7.53M9.9 4.24C10.58 4.09 11.28 4 12 4C19 4 23 12 23 12C22.39 13.15 21.62 14.29 20.72 15.35M14.12 14.12C13.63 14.65 12.86 15 12 15C10.34 15 9 13.66 9 12C9 11.14 9.35 10.37 9.88 9.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M1 1L23 23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <button
            className={`${styles.friendsFilterButton} ${friendsOnly ? styles.friendsFilterButtonActive : ''}`}
            onClick={onToggleFriendsOnly}
            type="button"
            aria-pressed={friendsOnly}
            aria-label={friendsOnly ? 'Показати всіх на карті' : 'Показати тільки друзів'}
            title={friendsOnly ? 'Тільки друзі' : 'Всі'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className={styles.activityPills} ref={pillsRef} onScroll={onPillsScroll}>
          {ACTIVITIES.map((activity) => (
            <button
              key={activity.id}
              type="button"
              className={`${styles.activityPill} ${activeActivityId === activity.id ? styles.activityPillActive : ''}`}
              onClick={() => onPillClick(activity)}
              disabled={!canCreateActivity}
              title={canCreateActivity ? undefined : 'Спочатку заверши поточний збір'}
            >
              {activity.icon}
              <span>{activity.label}</span>
            </button>
          ))}
          {/* Duplicate set — creates the illusion of an infinite loop when the
              row scrolls horizontally on mobile (see handlePillsScroll in
              Home.jsx). Hidden on wider screens where the row never needs to
              scroll, so activities don't visibly appear twice on desktop. */}
          {ACTIVITIES.map((activity) => (
            <button
              key={`${activity.id}-dup`}
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className={`${styles.activityPill} ${styles.activityPillDuplicate} ${activeActivityId === activity.id ? styles.activityPillActive : ''}`}
              onClick={() => onPillClick(activity)}
              disabled={!canCreateActivity}
            >
              {activity.icon}
              <span>{activity.label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className={styles.rightSidebar}>
        <Navbar onMenuToggle={onSidebarMenuToggle} />
        <button
          className={styles.recenterButton}
          onClick={onRecenter}
          type="button"
          disabled={!position}
          aria-label="Показати мою геопозицію"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            <path d="M12 2V5M12 19V22M2 12H5M19 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className={styles.visibilityButton}
          onClick={onToggleVisibility}
          type="button"
          disabled={togglingVisibility}
          aria-pressed={visibleOnMap}
          aria-label={visibleOnMap ? 'Сховати мене з карти' : 'Показати мене на карті'}
          title={visibleOnMap ? 'Видимий на карті' : 'Прихований з карти'}
        >
          {visibleOnMap ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 12C1 12 5 5 12 5C19 5 23 12 23 12C23 12 19 19 12 19C5 19 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.94 17.94C16.23 19.24 14.24 20 12 20C5 20 1 13 1 13C2.24 10.72 3.9 8.87 5.76 7.53M9.9 4.24C10.58 4.09 11.28 4 12 4C19 4 23 12 23 12C22.39 13.15 21.62 14.29 20.72 15.35M14.12 14.12C13.63 14.65 12.86 15 12 15C10.34 15 9 13.66 9 12C9 11.14 9.35 10.37 9.88 9.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1 1L23 23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <button
          className={`${styles.friendsFilterButton} ${friendsOnly ? styles.friendsFilterButtonActive : ''}`}
          onClick={onToggleFriendsOnly}
          type="button"
          aria-pressed={friendsOnly}
          aria-label={friendsOnly ? 'Показати всіх на карті' : 'Показати тільки друзів'}
          title={friendsOnly ? 'Тільки друзі' : 'Всі'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </>
  );
}
