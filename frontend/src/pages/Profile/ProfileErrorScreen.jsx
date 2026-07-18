import styles from './ProfileErrorScreen.module.css';

export default function ProfileErrorScreen({ message, onBack }) {
  return (
    <div className={styles.screen}>
      <div className={styles.overlayState}>
        <p>{message}</p>
        <button className={styles.backLink} onClick={onBack} type="button">
          ← Назад
        </button>
      </div>
    </div>
  );
}
