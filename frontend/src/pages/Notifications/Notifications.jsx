import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getNotifications,
  acceptFriendRequest,
  declineFriendRequest,
  acceptInvitation,
  declineInvitation,
} from '../../api/notifications';
import Navbar from '../../components/NavBar/Navbar';
import styles from './Notifications.module.css';

function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return 'щойно';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} хв тому`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн тому`;
  return new Date(isoString).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);

  const fetchNotifications = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getNotifications()
      .then(({ data }) => {
        if (cancelled) return;
        setNotifications(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити сповіщення.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const cancel = fetchNotifications();
    return cancel;
  }, [fetchNotifications]);

  const handleAction = async (notification, action) => {
    const rawId = notification.id.split('_').pop();
    setActingId(notification.id);

    try {
      if (notification.type === 'friend_request') {
        if (action === 'accept') {
          await acceptFriendRequest(rawId);
        } else {
          await declineFriendRequest(rawId);
        }
      } else if (notification.type === 'activity_invitation') {
        if (action === 'accept') {
          await acceptInvitation(rawId);
        } else {
          await declineInvitation(rawId);
        }
      }

      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    } catch {
      // action failed — leave the notification in the list for retry
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className={styles.screen}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <Navbar />
          <button className={styles.back} onClick={() => navigate(-1)} type="button">
            <span className={styles.backArrow} aria-hidden="true">←</span>
            Назад
          </button>
        </div>
      </header>

      <div className={styles.content}>
        <h1 className={styles.title}>Сповіщення</h1>

        {loading && (
          <div className={styles.overlayState}>
            <div className={styles.lane} aria-hidden="true">
              <span className={styles.laneDot} />
            </div>
            <p>Завантажуємо сповіщення…</p>
          </div>
        )}

        {!loading && error && (
          <div className={styles.overlayState}>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyText}>Немає нових сповіщень</p>
            <p className={styles.emptyHint}>Запрошення на активності та запити у друзі з'являться тут.</p>
          </div>
        )}

        {!loading && !error && notifications.length > 0 && (
          <ul className={styles.list}>
            {notifications.map((n) => {
              const isActing = actingId === n.id;
              const isFriendRequest = n.type === 'friend_request';

              return (
                <li key={n.id} className={styles.card}>
                  <Link
                    to={`/profile/${n.from_user.id}`}
                    className={styles.userLink}
                  >
                    <span className={styles.avatarWrap}>
                      {n.from_user.avatar ? (
                        <img src={n.from_user.avatar} alt={n.from_user.username} className={styles.avatarImg} />
                      ) : (
                        <span className={styles.avatarFallback}>
                          {n.from_user.username?.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className={styles.userInfo}>
                      <span className={styles.username}>{n.from_user.username}</span>
                      <span className={styles.meta}>
                        {isFriendRequest
                          ? 'хоче додати вас у друзі'
                          : n.activity?.category === 'cross'
                            ? 'вас запросили на Крос!!'
                            : `запрошує на «${n.activity?.title || 'активність'}»`
                        }
                      </span>
                      <span className={styles.time}>{timeAgo(n.created_at)}</span>
                    </span>
                  </Link>

                  {isFriendRequest && (
                    <div className={styles.actions}>
                      <button
                        className={styles.acceptBtn}
                        onClick={() => handleAction(n, 'accept')}
                        type="button"
                        disabled={isActing}
                      >
                        {isActing ? '…' : 'Прийняти'}
                      </button>
                      <button
                        className={styles.declineBtn}
                        onClick={() => handleAction(n, 'decline')}
                        type="button"
                        disabled={isActing}
                      >
                        Відхилити
                      </button>
                    </div>
                  )}

                  {!isFriendRequest && n.activity && (
                    <div className={styles.actions}>
                      <button
                        className={styles.acceptBtn}
                        onClick={() => handleAction(n, 'accept')}
                        type="button"
                        disabled={isActing}
                      >
                        {isActing ? '…' : 'Прийняти'}
                      </button>
                      <button
                        className={styles.declineBtn}
                        onClick={() => handleAction(n, 'decline')}
                        type="button"
                        disabled={isActing}
                      >
                        Відхилити
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
