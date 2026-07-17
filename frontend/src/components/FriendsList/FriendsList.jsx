import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFriends } from '../../api/friends';
import styles from './FriendsList.module.css';

export default function FriendsList() {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getFriends()
      .then(({ data }) => {
        if (cancelled) return;
        setFriends(Array.isArray(data) ? data : data.results || []);
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити список друзів.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Друзі</h2>

      {loading && (
        <div className={styles.state}>
          <div className={styles.lane} aria-hidden="true">
            <span className={styles.laneDot} />
          </div>
          <p>Завантажуємо…</p>
        </div>
      )}

      {!loading && error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!loading && !error && friends.length === 0 && (
        <p className={styles.empty}>У вас поки немає друзів.</p>
      )}

      {!loading && !error && friends.length > 0 && (
        <ul className={styles.list}>
          {friends.map((friend) => (
            <li key={friend.id} className={styles.card}>
              <Link to={`/profile/${friend.id}`} className={styles.userLink}>
                <span className={styles.avatarWrap}>
                  {friend.avatar ? (
                    <img src={friend.avatar} alt={friend.username} className={styles.avatarImg} />
                  ) : (
                    <span className={styles.avatarFallback}>
                      {friend.username?.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className={styles.userInfo}>
                  <span className={styles.username}>{friend.username}</span>
                  {friend.bio && <span className={styles.bio}>{friend.bio}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
