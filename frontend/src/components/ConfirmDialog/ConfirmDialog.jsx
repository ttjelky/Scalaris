import styles from './ConfirmDialog.module.css';

export default function ConfirmDialog({ title, text, confirmLabel, loadingLabel, loading, onConfirm, onCancel }) {
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <h2 className={styles.modalTitle}>{title}</h2>
        <p className={styles.modalText}>{text}</p>
        <div className={styles.modalActions}>
          <button
            className={styles.cancelButton}
            onClick={onCancel}
            type="button"
            disabled={loading}
          >
            Скасувати
          </button>
          <button
            className={styles.confirmButton}
            onClick={onConfirm}
            type="button"
            disabled={loading}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
