import { PhoneIcon } from './icons';
import styles from './ProfilePhoneRow.module.css';

export default function ProfilePhoneRow({ phone, isOwnProfile, onAddClick }) {
  return (
    <div className={styles.phoneRow}>
      {phone ? (
        <>
          <span className={styles.phoneIcon} aria-hidden="true">
            <PhoneIcon />
          </span>
          <span className={styles.phoneValue}>{phone}</span>
        </>
      ) : (
        isOwnProfile && (
          <button className={styles.phoneAddButton} onClick={onAddClick} type="button">
            <PhoneIcon />
            Додати номер телефону
          </button>
        )
      )}
    </div>
  );
}
