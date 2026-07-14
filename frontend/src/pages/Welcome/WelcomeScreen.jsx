import { Link } from 'react-router-dom';
import logo from '../../assets/scalaris-logo.svg';
import styles from './WelcomeScreen.module.css';

/**
 * Вітальний екран для незалогіненого користувача.
 *
 * backgroundImage — url свого фото (street-активність, не Nike-скрін!).
 * Якщо не передати — використовується темний градієнт-плейсхолдер.
 */
export default function WelcomeScreen({ backgroundImage, activeNearby = 128 }) {
  return (
    <div
      className={styles.screen}
      style={backgroundImage ? { '--bg-image': `url(${backgroundImage})` } : undefined}
    >
      <div className={styles.overlay} />

      <header className={styles.header}>
        <img src={logo} alt="Scalaris" className={styles.logo} />
      </header>

      <div className={styles.content}>
        <div className={styles.liveBadge}>
          <span className={styles.pulseDot} aria-hidden="true" />
          <span>{activeNearby} активні поруч</span>
        </div>

        <h1 className={styles.title}>Scalaris</h1>
        <p className={styles.subtitle}>
          Час вийти на вулицю!
          <br />
          Знаходь людей поруч і вирушай у подорож.
        </p>

        <div className={styles.actions}>
          <Link to="/register" className={`${styles.button} ${styles.primary}`}>
            Реєстрація
          </Link>
          <Link to="/login" className={`${styles.button} ${styles.secondary}`}>
            Вхід
          </Link>
        </div>
      </div>
    </div>
  );
}
