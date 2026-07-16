import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar/Navbar';
import styles from './Profile.module.css';

export default function Profile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { logout, updateUser } = useAuth();

  // No :id in the route (came from "/profile") → this is the logged-in
  // user's own profile, fetched via /users/me/ and editable.
  const isOwnProfile = !id;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [blocked, setBlocked] = useState(false);
  const [togglingBlock, setTogglingBlock] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  const [discordUnlinking, setDiscordUnlinking] = useState(false);
  const [telegramUnlinking, setTelegramUnlinking] = useState(false);
  const [telegramConnecting, setTelegramConnecting] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState(null);
  const [socialError, setSocialError] = useState('');

  const onConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/', { replace: true });
    } finally {
      setLoggingOut(false);
      setConfirmingLogout(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const endpoint = isOwnProfile ? '/users/me/' : `/users/${id}/`;
    api
      .get(endpoint)
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data);
        setBioDraft(data.bio || '');
        setBlocked(Boolean(data.is_blocked));
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити профіль.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, isOwnProfile]);

  const onAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const onSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const formData = new FormData();
      formData.append('bio', bioDraft);
      if (avatarFile) formData.append('avatar', avatarFile);

      // Let the browser set the multipart Content-Type (with boundary) —
      // don't override it manually or the upload will be malformed.
      const { data } = await api.patch('/users/me/', formData);
      setProfile(data);
      if (isOwnProfile) updateUser(data);
      setEditing(false);
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch {
      setSaveError('Не вдалося зберегти зміни. Спробуй ще раз.');
    } finally {
      setSaving(false);
    }
  };

  const onCancelEdit = () => {
    setEditing(false);
    setBioDraft(profile?.bio || '');
    setAvatarFile(null);
    setAvatarPreview(null);
    setSaveError('');
  };

  const connectDiscord = () => {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    if (!clientId) {
      setSocialError('Discord ще не налаштований (немає VITE_DISCORD_CLIENT_ID).');
      return;
    }
    const redirectUri = `${window.location.origin}/oauth/discord/callback`;
    const url = new URL('https://discord.com/api/oauth2/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    window.location.href = url.toString();
  };

  const disconnectDiscord = async () => {
    setDiscordUnlinking(true);
    setSocialError('');
    try {
      await api.delete('/users/oauth/discord/unlink/');
      updateUser({ discord_username: '' });
    } catch {
      setSocialError('Не вдалося відʼєднати Discord. Спробуй ще раз.');
    } finally {
      setDiscordUnlinking(false);
    }
  };

  const disconnectTelegram = async () => {
    setTelegramUnlinking(true);
    setSocialError('');
    try {
      await api.delete('/users/oauth/telegram/unlink/');
      updateUser({ telegram_username: '' });
    } catch {
      setSocialError('Не вдалося відʼєднати Telegram. Спробуй ще раз.');
    } finally {
      setTelegramUnlinking(false);
    }
  };

  // Telegram: без Login Widget (той вимагає прив'язаний домен через
  // BotFather /setdomain, що не працює на localhost). Замість цього —
  // одноразовий код: бекенд його генерує, ми відкриваємо посилання на
  // бота, юзер тисне /start у Telegram, окремий процес (management command
  // telegram_bot) підхоплює це і привʼязує акаунт. Поки чекаємо — просто
  // періодично перепитуємо /users/me/, чи вже зʼявився telegram_username.
  const connectTelegram = async () => {
    setTelegramConnecting(true);
    setSocialError('');
    try {
      const { data } = await api.post('/users/oauth/telegram/start/');
      setTelegramDeepLink(data.deep_link);
      window.open(data.deep_link, '_blank', 'noopener,noreferrer');
    } catch {
      setSocialError('Не вдалося розпочати підключення Telegram. Спробуй ще раз.');
      setTelegramConnecting(false);
    }
  };

  useEffect(() => {
    if (!telegramConnecting) return undefined;

    const interval = setInterval(async () => {
      try {
        const { data } = await api.get('/users/me/');
        if (data.telegram_username) {
          updateUser(data);
          setTelegramConnecting(false);
          setTelegramDeepLink(null);
        }
      } catch {
        // тимчасовий збій мережі — просто спробуємо ще раз на наступному тіку
      }
    }, 2500);

    // Не чекаємо вічно — код все одно згорає за 10 хв на бекенді.
    const timeout = setTimeout(() => {
      setTelegramConnecting(false);
      setTelegramDeepLink(null);
    }, 10 * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [telegramConnecting, updateUser]);

  const onToggleBlock = async () => {
    setTogglingBlock(true);
    try {
      if (blocked) {
        await api.delete(`/users/${id}/block/`);
        setBlocked(false);
      } else {
        await api.post(`/users/${id}/block/`);
        setBlocked(true);
      }
    } catch {
      // best-effort — leave state as-is, the button just stays clickable to retry
    } finally {
      setTogglingBlock(false);
      setConfirmingBlock(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.screen}>
        <div className={styles.overlayState}>
          <div className={styles.lane} aria-hidden="true">
            <span className={styles.laneDot} />
          </div>
          <p>Завантажуємо профіль…</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={styles.screen}>
        <div className={styles.overlayState}>
          <p>{error || 'Користувача не знайдено.'}</p>
          <button className={styles.backLink} onClick={() => navigate(-1)} type="button">
            ← Назад
          </button>
        </div>
      </div>
    );
  }

  const displayAvatar = avatarPreview || profile.avatar;

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
        {isOwnProfile && !editing && (
          <button className={styles.editButton} onClick={() => setEditing(true)} type="button">
            Редагувати
          </button>
        )}
      </header>

      <div className={styles.content}>
        <div className={styles.avatarBlock}>
          <div className={styles.avatarWrap}>
            {displayAvatar ? (
              <img src={displayAvatar} alt={profile.username} className={styles.avatarImg} />
            ) : (
              <span className={styles.avatarFallback}>{profile.username?.slice(0, 1).toUpperCase()}</span>
            )}
            {editing && (
              <label className={styles.avatarEditLabel}>
                <input type="file" accept="image/*" onChange={onAvatarChange} hidden />
                Змінити фото
              </label>
            )}
          </div>
          <h1 className={styles.username}>{profile.username}</h1>
        </div>

        {editing ? (
          <div className={styles.editForm}>
            {saveError && (
              <p className={styles.formError} role="alert">
                {saveError}
              </p>
            )}
            <label className={styles.field}>
              <span className={styles.label}>Про себе</span>
              <textarea
                className={styles.textarea}
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                maxLength={280}
                rows={4}
                placeholder="Розкажи щось про себе…"
              />
              <span className={styles.charCount}>{bioDraft.length}/280</span>
            </label>

            <div className={styles.editActions}>
              <button className={styles.cancelButton} onClick={onCancelEdit} type="button" disabled={saving}>
                Скасувати
              </button>
              <button className={styles.saveButton} onClick={onSave} type="button" disabled={saving}>
                {saving ? 'Зберігаємо…' : 'Зберегти'}
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.bio}>
            {profile.bio || (isOwnProfile ? 'Додай опис про себе.' : 'Користувач ще не додав опис.')}
          </p>
        )}

        {isOwnProfile && !editing && (
          <div className={styles.socialSection}>
            <span className={styles.label}>Соцмережі</span>

            {socialError && (
              <p className={styles.formError} role="alert">
                {socialError}
              </p>
            )}

            <div className={styles.socialRow}>
              <span className={styles.socialName}>Discord</span>
              {profile.discord_username ? (
                <div className={styles.socialConnected}>
                  <span className={styles.socialHandle}>{profile.discord_username}</span>
                  <button
                    className={styles.socialUnlink}
                    onClick={disconnectDiscord}
                    type="button"
                    disabled={discordUnlinking}
                  >
                    {discordUnlinking ? '…' : 'Відʼєднати'}
                  </button>
                </div>
              ) : (
                <button className={styles.socialConnect} onClick={connectDiscord} type="button">
                  Підключити
                </button>
              )}
            </div>

            <div className={styles.socialRow}>
              <span className={styles.socialName}>Telegram</span>
              {profile.telegram_username ? (
                <div className={styles.socialConnected}>
                  <span className={styles.socialHandle}>@{profile.telegram_username}</span>
                  <button
                    className={styles.socialUnlink}
                    onClick={disconnectTelegram}
                    type="button"
                    disabled={telegramUnlinking}
                  >
                    {telegramUnlinking ? '…' : 'Відʼєднати'}
                  </button>
                </div>
              ) : (
                <div className={styles.socialConnected}>
                  {telegramConnecting ? (
                    <>
                      <span className={styles.socialHint}>Очікуємо підтвердження в Telegram…</span>
                      {telegramDeepLink && (
                        <a
                          className={styles.socialConnect}
                          href={telegramDeepLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Відкрити бота ще раз
                        </a>
                      )}
                    </>
                  ) : (
                    <button className={styles.socialConnect} onClick={connectTelegram} type="button">
                      Підключити
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {isOwnProfile && !editing && (
          <button
            className={styles.logoutButton}
            onClick={() => setConfirmingLogout(true)}
            type="button"
          >
            Вийти з акаунту
          </button>
        )}

        {!isOwnProfile && (
          <div className={styles.safetyActions}>
            <button
              className={styles.blockButton}
              onClick={() => (blocked ? onToggleBlock() : setConfirmingBlock(true))}
              type="button"
              disabled={togglingBlock}
            >
              {blocked ? 'Розблокувати' : 'Заблокувати'}
            </button>
          </div>
        )}
      </div>

      {confirmingLogout && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Вийти з акаунту?</h2>
            <p className={styles.modalText}>Доведеться увійти знову, щоб продовжити користуватись застосунком.</p>
            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setConfirmingLogout(false)}
                type="button"
                disabled={loggingOut}
              >
                Скасувати
              </button>
              <button
                className={styles.confirmLogoutButton}
                onClick={onConfirmLogout}
                type="button"
                disabled={loggingOut}
              >
                {loggingOut ? 'Виходимо…' : 'Так, вийти'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingBlock && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Заблокувати {profile.username}?</h2>
            <p className={styles.modalText}>
              Ви перестанете бачити одне одного на карті. Скасувати блокування можна будь-коли.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setConfirmingBlock(false)}
                type="button"
                disabled={togglingBlock}
              >
                Скасувати
              </button>
              <button
                className={styles.confirmLogoutButton}
                onClick={onToggleBlock}
                type="button"
                disabled={togglingBlock}
              >
                {togglingBlock ? 'Блокуємо…' : 'Так, заблокувати'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}