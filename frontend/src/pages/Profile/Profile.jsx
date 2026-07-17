import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar/Navbar';
import FriendsList from '../../components/FriendsList/FriendsList';
import FriendActionButton from '../../components/FriendActionButton/FriendActionButton';
import styles from './Profile.module.css';

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.3 5.4A18.3 18.3 0 0 0 15.9 4c-.2.4-.4.9-.6 1.3a17 17 0 0 0-6.6 0A9 9 0 0 0 8.1 4a18.3 18.3 0 0 0-4.4 1.4C1 10.1.3 14.6.6 19.1a18.4 18.4 0 0 0 5.6 2.9c.4-.6.8-1.3 1.2-2a12 12 0 0 1-1.9-.9l.5-.4a13 13 0 0 0 11 0l.5.4c-.6.4-1.3.7-1.9.9.4.7.8 1.4 1.2 2a18.3 18.3 0 0 0 5.6-2.9c.4-5.2-.9-9.6-3.1-13.7ZM8.7 16.4c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.9 2.2-1.9 2.2Zm6.6 0c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.8 2.2-1.9 2.2Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

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
  const [phoneDraft, setPhoneDraft] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarError, setAvatarError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [blocked, setBlocked] = useState(false);
  const [togglingBlock, setTogglingBlock] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  const [discordUnlinking, setDiscordUnlinking] = useState(false);
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
        setPhoneDraft(data.phone || '');
        setBlocked(Boolean(data.is_blocked));
        setAvatarError(false);
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
    setAvatarError(false);
  };

  const onSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const formData = new FormData();
      formData.append('bio', bioDraft);
      formData.append('phone', phoneDraft);
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
    setPhoneDraft(profile?.phone || '');
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
    const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
    window.location.href = url;
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
  const showAvatarImg = Boolean(displayAvatar) && !avatarError;

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
        <div className={styles.avatarBlock}>
          <div className={styles.avatarWrap}>
            {showAvatarImg ? (
              <img
                src={displayAvatar}
                alt={profile.username}
                className={styles.avatarImg}
                onError={() => setAvatarError(true)}
              />
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
          {isOwnProfile && !editing && (
            <button className={styles.editButton} onClick={() => setEditing(true)} type="button">
              Редагувати профіль
            </button>
          )}
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

            <label className={styles.field}>
              <span className={styles.label}>Номер телефону</span>
              <input
                type="tel"
                className={styles.textInput}
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
                placeholder="+380 xx xxx xx xx"
                autoComplete="tel"
              />
              <span className={styles.fieldHint}>Буде видно іншим користувачам у вашому профілі.</span>
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

        {!editing && (profile.phone || isOwnProfile) && (
          <div className={styles.phoneRow}>
            {profile.phone ? (
              <>
                <span className={styles.phoneIcon} aria-hidden="true">
                  <PhoneIcon />
                </span>
                <span className={styles.phoneValue}>{profile.phone}</span>
              </>
            ) : (
              isOwnProfile && (
                <button className={styles.phoneAddButton} onClick={() => setEditing(true)} type="button">
                  <PhoneIcon />
                  Додати номер телефону
                </button>
              )
            )}
          </div>
        )}

        {isOwnProfile && !editing && (
          <div className={styles.socialSection}>
            <span className={styles.label}>Соцмережі</span>

            {socialError && (
              <p className={styles.formError} role="alert">
                {socialError}
              </p>
            )}

            <div className={styles.socialChipsRow}>
              {profile.discord_username ? (
                <span className={`${styles.socialChip} ${styles.socialChipConnected}`}>
                  <span className={`${styles.socialChipIcon} ${styles.socialChipIconDiscord}`} aria-hidden="true">
                    <DiscordIcon />
                  </span>
                  <span className={styles.socialChipLabel}>{profile.discord_username}</span>
                  <button
                    className={styles.socialChipUnlink}
                    onClick={disconnectDiscord}
                    type="button"
                    disabled={discordUnlinking}
                    aria-label="Відʼєднати Discord"
                  >
                    {discordUnlinking ? '…' : '×'}
                  </button>
                </span>
              ) : (
                <button className={styles.socialChip} onClick={connectDiscord} type="button">
                  <span className={`${styles.socialChipIcon} ${styles.socialChipIconDiscord}`} aria-hidden="true">
                    <DiscordIcon />
                  </span>
                  <span className={styles.socialChipLabel}>Discord</span>
                </button>
              )}
            </div>
          </div>
        )}

        {isOwnProfile && !editing && <FriendsList />}

        {isOwnProfile && !editing && (
          <button
            className={styles.logoutButton}
            onClick={() => setConfirmingLogout(true)}
            type="button"
          >
            <span className={styles.logoutIcon} aria-hidden="true">
              <LogoutIcon />
            </span>
            Вийти з акаунту
          </button>
        )}

        {!isOwnProfile && !editing && !blocked && (
          <FriendActionButton
            userId={Number(id)}
            friendshipStatus={profile.friendship_status}
            friendRequestId={profile.friend_request_id}
          />
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