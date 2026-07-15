import { Link } from 'react-router-dom';
import logo from '../../assets/scalaris-logo.svg';
import styles from './AuthLayout.module.css';

export default function AuthLayout({ eyebrow, title, subtitle, children, footer, pending }) {
  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.back}>
          <span className={styles.backArrow} aria-hidden="true">←</span>
          Повернутися
        </Link>
        <img src={logo} alt="Scalaris" className={styles.logo} />
      </div>

      <div className={styles.header}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      <div className={`${styles.lane} ${pending ? styles.laneActive : ''}`} aria-hidden="true">
        <span className={styles.laneDot} />
      </div>

      <div className={styles.card}>{children}</div>

      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
