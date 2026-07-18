import styles from './ProfileBioText.module.css';

export default function ProfileBioText({ bio, isOwnProfile }) {
  return (
    <p className={styles.bio}>
      {bio || (isOwnProfile ? 'Додай опис про себе.' : 'Користувач ще не додав опис.')}
    </p>
  );
}
