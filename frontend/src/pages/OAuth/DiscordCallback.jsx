import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import styles from './OAuthCallback.module.css';

export default function DiscordCallback() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [error, setError] = useState('');
  const ranOnce = useRef(false);

  useEffect(() => {
    // Guards against React StrictMode's double-invoke in dev, which would
    // otherwise send the same one-time-use Discord code twice — the
    // second exchange always fails since Discord invalidates it after
    // the first use.
    if (ranOnce.current) return;
    ranOnce.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const oauthError = params.get('error');

    if (oauthError) {
      setError('Discord відхилив запит на підключення.');
      return;
    }
    if (!code) {
      setError('Не отримано код авторизації від Discord.');
      return;
    }

    api
      .post('/users/oauth/discord/callback/', {
        code,
        redirect_uri: `${window.location.origin}/oauth/discord/callback`,
      })
      .then(({ data }) => {
        updateUser(data);
        navigate('/profile', { replace: true });
      })
      .catch(() => {
        setError('Не вдалося підключити Discord. Спробуй ще раз.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.screen}>
      {error ? (
        <div className={styles.overlayState}>
          <p>{error}</p>
          <button className={styles.backLink} onClick={() => navigate('/profile', { replace: true })} type="button">
            ← Назад до профілю
          </button>
        </div>
      ) : (
        <div className={styles.overlayState}>
          <div className={styles.lane} aria-hidden="true">
            <span className={styles.laneDot} />
          </div>
          <p>Підключаємо Discord…</p>
        </div>
      )}
    </div>
  );
}