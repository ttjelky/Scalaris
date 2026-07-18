import Navbar from '../../components/Navbar/Navbar';
import styles from './ProfileTopbar.module.css';

export default function ProfileTopbar({ onBack }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <Navbar />
        <button className={styles.back} onClick={onBack} type="button">
          <span className={styles.backArrow} aria-hidden="true">←</span>
          Назад
        </button>
      </div>
    </header>
  );
}
