import { LogoutIcon } from './icons';
import styles from './LogoutSection.module.css';

export default function LogoutSection({ onClick }) {
  return (
    <button className={styles.logoutButton} onClick={onClick} type="button">
      <span className={styles.logoutIcon} aria-hidden="true">
        <LogoutIcon />
      </span>
      Вийти з акаунту
    </button>
  );
}
