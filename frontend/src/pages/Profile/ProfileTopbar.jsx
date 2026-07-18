import Navbar from '../../components/Navbar/Navbar';
import styles from './ProfileTopbar.module.css';

export default function ProfileTopbar() {
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <Navbar />
      </div>
    </header>
  );
}