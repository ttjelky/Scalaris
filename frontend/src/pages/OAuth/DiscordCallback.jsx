import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { parseApiError } from '../../utils/apiErrors';
import { getDiscordRedirectUri, claimDiscordCallback } from '../../utils/discordAuth';
import styles from './OAuthCallback.module.css';

export default function DiscordCallback() {
  const navigate = useNavigate();
  const { isAuthenticated, loading, loginWithDiscord, updateUser } = useAuth();
  const [error, setError] = useState('');

  // Validate the OAuth redirect params once, before any async work. This
  // runs during render (pure, no side effects) so it never trips the
  // "setState synchronously in an effect" lint rule — the early errors are
  // derived state, not state we mutate inside the effect body.
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const oauthError = params.get('error');

  const initialError = oauthError
    ? 'Discord відхилив запит на авторизацію.'
    : !code
      ? 'Не отримано код авторизації від Discord.'
      : '';

  useEffect(() => {
    // Чекаємо, поки AuthProvider визначить, є валідна сесія чи ні — від
    // цього залежить, який флоу (лінк проти вже залогіненого юзера, чи
    // логін/реєстрація анонімного) треба виконати нижче.
    if (loading) return;
    if (initialError) return;
    if (!claimDiscordCallback(code)) {
      return;
    }

    if (isAuthenticated) {
      // Юзер уже залогінений (прийшов сюди з кнопки "Підключити" в
      // профілі) — прив'язуємо Discord до поточного акаунту.
      api
        .post('/users/oauth/discord/link/', {
          code,
          redirect_uri: getDiscordRedirectUri(),
        })
        .then(({ data }) => {
          updateUser(data);
          navigate('/profile', { replace: true });
        })
        .catch((err) => {
          if (err.response?.status === 409) {
            setError('Цей Discord-акаунт вже прив’язано до іншого користувача.');
          } else {
            setError('Не вдалося підключити Discord. Спробуй ще раз.');
          }
        });
      return;
    }

    // Анонімний юзер (прийшов з кнопки "Увійти через Discord" на
    // Login/Register) — логін або, якщо такого акаунту ще нема,
    // автоматична реєстрація через Discord-профіль.
    loginWithDiscord(code)
      .then(() => {
        navigate('/home', { replace: true });
      })
      .catch((err) => {
        const { generalError } = parseApiError(err, {
          fallback: 'Не вдалося увійти через Discord. Спробуй ще раз.',
        });
        setError(generalError);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated]);

  const backTarget = isAuthenticated ? '/profile' : '/login';
  const backLabel = isAuthenticated ? '← Назад до профілю' : '← Назад до входу';

  return (
    <div className={styles.screen}>
      {(error || initialError) ? (
        <div className={styles.overlayState}>
          <p>{error || initialError}</p>
          <button className={styles.backLink} onClick={() => navigate(backTarget, { replace: true })} type="button">
            {backLabel}
          </button>
        </div>
      ) : (
        <div className={styles.overlayState}>
          <div className={styles.lane} aria-hidden="true">
            <span className={styles.laneDot} />
          </div>
          <p>Зʼєднуємось із Discord…</p>
        </div>
      )}
    </div>
  );
}
