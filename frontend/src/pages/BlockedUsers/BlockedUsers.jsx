import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import Navbar from '../../components/Navbar/Navbar';
import styles from './BlockedUsers.module.css';

export default function BlockedUsers() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unblockingId, setUnblockingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    // BlockedUsersListView на бекенді зареєстрований як users/blocked/
    // (див. urls.py), бере request.user неявно — без /me/ в шляху.
    api
      .get('/users/blocked/')
      .then(({ data }) => {
        if (cancelled) return;
        setUsers(Array.isArray(data) ? data : data.results || []);
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити список заблокованих.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const onUnblock = async (id) => {
    setUnblockingId(id);
    try {
      await api.delete(`/users/${id}/block/`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch {
      // best-effort — юзер лишається у списку, кнопка лишається клікабельною для повтору
    } finally {
      setUnblockingId(null);
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
        <h1 className={styles.title}>Заблоковані користувачі</h1>

        {loading && (
          <div className={styles.overlayState}>
            <div className={styles.lane} aria-hidden="true">
              <span className={styles.laneDot} />
            </div>
            <p>Завантажуємо список…</p>
          </div>
        )}

        {!loading && error && (
          <div className={styles.overlayState}>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && users.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyText}>Ви ще нікого не заблокували.</p>
            <p className={styles.emptyHint}>Заблокувати користувача можна на сторінці його профілю.</p>
          </div>
        )}

        {!loading && !error && users.length > 0 && (
          <ul className={styles.list}>
            {users.map((u) => (
              <li key={u.id} className={styles.card}>
                <Link to={`/profile/${u.id}`} className={styles.userLink}>
                  <span className={styles.avatarWrap}>
                    {u.avatar ? (
                      <img src={u.avatar} alt={u.username} className={styles.avatarImg} />
                    ) : (
                      <span className={styles.avatarFallback}>{u.username?.slice(0, 1).toUpperCase()}</span>
                    )}
                  </span>
                  <span className={styles.userInfo}>
                    <span className={styles.username}>{u.username}</span>
                    {u.bio && <span className={styles.bio}>{u.bio}</span>}
                  </span>
                </Link>

                <button
                  className={styles.unblockButton}
                  onClick={() => onUnblock(u.id)}
                  type="button"
                  disabled={unblockingId === u.id}
                >
                  {unblockingId === u.id ? '…' : 'Розблокувати'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
