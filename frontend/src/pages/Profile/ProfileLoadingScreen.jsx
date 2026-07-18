import styles from './ProfileLoadingScreen.module.css';

export default function ProfileLoadingScreen() {
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
