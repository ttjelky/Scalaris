import styles from './ProfileAvatarSection.module.css';

// `showAvatarImg` / `displayAvatar` are computed by the caller (Profile.jsx)
// since they depend on both the freshly-picked file preview and whether the
// image previously failed to load.
export default function ProfileAvatarSection({
  profile,
  isOwnProfile,
  editing,
  onStartEdit,
  showAvatarImg,
  displayAvatar,
  onAvatarError,
  onAvatarChange,
}) {
  return (
    <div className={styles.avatarBlock}>
      <div className={styles.avatarWrap}>
        {showAvatarImg ? (
          <img
            src={displayAvatar}
            alt={profile.username}
            className={styles.avatarImg}
            onError={onAvatarError}
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
        <button className={styles.editButton} onClick={onStartEdit} type="button">
          Редагувати профіль
        </button>
      )}
    </div>
  );
}
