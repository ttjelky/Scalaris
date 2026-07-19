import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import FriendsList from '../../components/FriendsList/FriendsList';
import FriendActionButton from '../../components/FriendActionButton/FriendActionButton';
import styles from './Profile.module.css';

import ProfileLoadingScreen from './ProfileLoadingScreen';
import ProfileErrorScreen from './ProfileErrorScreen';
import ProfileTopbar from './ProfileTopbar';
import ProfileAvatarSection from './ProfileAvatarSection';
import ProfileEditForm from './ProfileEditForm';
import ProfileBioText from './ProfileBioText';
import ProfilePhoneRow from './ProfilePhoneRow';
import SocialLinksSection from './SocialLinksSection';
import LogoutSection from './LogoutSection';
import BlockAction from './BlockAction';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';

export default function Profile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { logout, updateUser } = useAuth();

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
    return <ProfileLoadingScreen />;
  }

  if (error || !profile) {
    return (
      <ProfileErrorScreen
        message={error || 'Користувача не знайдено.'}
        onBack={() => navigate(-1)}
      />
    );
  }

  const displayAvatar = avatarPreview || profile.avatar;
  const showAvatarImg = Boolean(displayAvatar) && !avatarError;

  return (
    <div className={styles.screen}>
      <ProfileTopbar onBack={() => navigate(-1)} />

      <div className={styles.content}>
        <ProfileAvatarSection
          profile={profile}
          isOwnProfile={isOwnProfile}
          editing={editing}
          onStartEdit={() => setEditing(true)}
          showAvatarImg={showAvatarImg}
          displayAvatar={displayAvatar}
          onAvatarError={() => setAvatarError(true)}
          onAvatarChange={onAvatarChange}
        />

        {editing ? (
          <ProfileEditForm
            bioDraft={bioDraft}
            setBioDraft={setBioDraft}
            phoneDraft={phoneDraft}
            setPhoneDraft={setPhoneDraft}
            saveError={saveError}
            saving={saving}
            onSave={onSave}
            onCancel={onCancelEdit}
          />
        ) : (
          <ProfileBioText bio={profile.bio} isOwnProfile={isOwnProfile} />
        )}

        {!editing && (profile.phone || isOwnProfile) && (
          <ProfilePhoneRow
            phone={profile.phone}
            isOwnProfile={isOwnProfile}
            onAddClick={() => setEditing(true)}
          />
        )}

        {isOwnProfile && !editing && (
          <SocialLinksSection
            discordUsername={profile.discord_username}
            socialError={socialError}
            discordUnlinking={discordUnlinking}
            onConnectDiscord={connectDiscord}
            onDisconnectDiscord={disconnectDiscord}
          />
        )}

        {isOwnProfile && !editing && <FriendsList />}

        {isOwnProfile && !editing && (
          <LogoutSection onClick={() => setConfirmingLogout(true)} />
        )}

        {!isOwnProfile && !editing && !blocked && (
          <FriendActionButton
            userId={Number(id)}
            friendshipStatus={profile.friendship_status}
            friendRequestId={profile.friend_request_id}
          />
        )}

        {!isOwnProfile && (
          <BlockAction
            blocked={blocked}
            togglingBlock={togglingBlock}
            onClick={() => (blocked ? onToggleBlock() : setConfirmingBlock(true))}
          />
        )}
      </div>

      {confirmingLogout && createPortal(
        <ConfirmDialog
          title="Вийти з акаунту?"
          text="Доведеться увійти знову, щоб продовжити користуватись застосунком."
          confirmLabel="Так, вийти"
          loadingLabel="Виходимо…"
          loading={loggingOut}
          onConfirm={onConfirmLogout}
          onCancel={() => setConfirmingLogout(false)}
        />,
        document.body,
      )}

      {confirmingBlock && createPortal(
        <ConfirmDialog
          title={`Заблокувати ${profile.username}?`}
          text="Ви перестанете бачити одне одного на карті. Скасувати блокування можна будь-коли."
          confirmLabel="Так, заблокувати"
          loadingLabel="Блокуємо…"
          loading={togglingBlock}
          onConfirm={onToggleBlock}
          onCancel={() => setConfirmingBlock(false)}
        />,
        document.body,
      )}
    </div>
  );
}
