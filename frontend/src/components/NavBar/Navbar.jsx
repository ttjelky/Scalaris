import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useNotifications from '../../hooks/useNotifications';
import styles from './Navbar.module.css';

const ICONS = {
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 10.5L12 4L20 10.5V19C20 19.5523 19.5523 20 19 20H15V14H9V20H5C4.44772 20 4 19.5523 4 19V10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
  user: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 20C5.8 16.5 8.5 14.5 12 14.5C15.5 14.5 18.2 16.5 19 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  logout: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 4H18C18.5523 4 19 4.44772 19 5V19C19 19.5523 18.5523 20 18 20H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 8L15 12L11 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 12H4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  bell: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4C9.79086 4 8 5.79086 8 8V10.3C8 10.9 7.8 11.5 7.4 12L6.5 13.2C6.2 13.6 6.4 14.1 6.9 14.1H17.1C17.6 14.1 17.8 13.6 17.5 13.2L16.6 12C16.2 11.5 16 10.9 16 10.3V8C16 5.79086 14.2091 4 12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 15.5C10.4 16.2 11.1 16.7 12 16.7C12.9 16.7 13.6 16.2 14 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  lock: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="11" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 11V8C8.5 5.79086 10.2909 4 12.5 4C14.5544 4 16.2478 5.55089 16.4767 7.54415" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="15.3" r="1.3" fill="currentColor" />
    </svg>
  ),
};

const ITEMS = [
  { key: 'home', to: '/home', label: 'Головна', icon: 'home' },
  { key: 'profile', to: '/profile', label: 'Профіль', icon: 'user' },
  { key: 'notifications', to: '/notifications', label: 'Сповіщення', icon: 'bell' },
  { key: 'blocked', to: '/blocked-users', label: 'Заблоковані користувачі', icon: 'lock' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { notifCount } = useNotifications();

  const close = () => setOpen(false);

  useEffect(() => {
    close();
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const onLogoutClick = () => {
    setConfirmingLogout(true);
  };

  const onConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/', { replace: true });
    } finally {
      setLoggingOut(false);
      setConfirmingLogout(false);
      close();
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.burger} ${open ? styles.burgerOpen : ''}`}
        aria-label={open ? 'Закрити меню' : 'Відкрити меню'}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={styles.burgerLine} />
        <span className={styles.burgerLine} />
        <span className={styles.burgerLine} />
      </button>

      <nav className={`${styles.menu} ${open ? styles.menuOpen : ''}`} aria-hidden={!open}>
        <ul className={styles.list}>
          {ITEMS.map((item, i) => {
            const isActive = item.to && location.pathname === item.to;
            const showBadge = item.key === 'notifications' && notifCount > 0;
            const content = (
              <>
                <span className={styles.itemIcon}>{ICONS[item.icon]}</span>
                <span className={styles.itemLabel}>{item.label}</span>
                {showBadge && <span className={styles.notifBadge}>{notifCount}</span>}
              </>
            );

            return (
              <li key={item.key} className={styles.item} style={{ transitionDelay: open ? `${i * 40}ms` : '0ms' }}>
                <Link to={item.to} className={`${styles.itemLink} ${isActive ? styles.itemActive : ''}`}>
                  {content}
                </Link>
              </li>
            );
          })}

          <li className={styles.divider} aria-hidden="true" />

          <li className={styles.item} style={{ transitionDelay: open ? `${ITEMS.length * 40}ms` : '0ms' }}>
            <button type="button" className={`${styles.itemLink} ${styles.itemLogout}`} onClick={onLogoutClick}>
              <span className={styles.itemIcon}>{ICONS.logout}</span>
              <span className={styles.itemLabel}>Вийти</span>
            </button>
          </li>
        </ul>
      </nav>

      {confirmingLogout && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Вийти з акаунту?</h2>
            <p className={styles.modalText}>Доведеться увійти знову, щоб продовжити користуватись застосунком.</p>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setConfirmingLogout(false)} type="button" disabled={loggingOut}>
                Скасувати
              </button>
              <button className={styles.modalConfirm} onClick={onConfirmLogout} type="button" disabled={loggingOut}>
                {loggingOut ? 'Виходимо…' : 'Так, вийти'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}