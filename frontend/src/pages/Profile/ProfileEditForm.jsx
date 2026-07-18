import styles from './ProfileEditForm.module.css';

export default function ProfileEditForm({
  bioDraft,
  setBioDraft,
  phoneDraft,
  setPhoneDraft,
  saveError,
  saving,
  onSave,
  onCancel,
}) {
  return (
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
        <button className={styles.cancelButton} onClick={onCancel} type="button" disabled={saving}>
          Скасувати
        </button>
        <button className={styles.saveButton} onClick={onSave} type="button" disabled={saving}>
          {saving ? 'Зберігаємо…' : 'Зберегти'}
        </button>
      </div>
    </div>
  );
}
