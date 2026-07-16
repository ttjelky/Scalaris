import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
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
        <button className={styles.back} onClick={() => navigate(-1)} type="button">
          <span className={styles.backArrow} aria-hidden="true">←</span>
          Назад
        </button>
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
          <button
            className={styles.logoutButton}
            onClick={() => setConfirmingLogout(true)}
            type="button"
          >
            Вийти з акаунту
          </button>
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
    </div>
  );
}
