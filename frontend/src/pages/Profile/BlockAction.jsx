import styles from './BlockAction.module.css';

export default function BlockAction({ blocked, togglingBlock, onClick }) {
  return (
    <div className={styles.safetyActions}>
      <button
        className={styles.blockButton}
        onClick={onClick}
        type="button"
        disabled={togglingBlock}
      >
        {blocked ? 'Розблокувати' : 'Заблокувати'}
      </button>
    </div>
  );
}
