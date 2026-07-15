import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './Home.module.css';

/**
 * Тимчасовий екран для залогіненого користувача.
 * Заміни на реальний feed/карту, коли будете готові —
 * головне, щоб він і надалі жив під /home під ProtectedRoute.
 */
export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <span className={styles.eyebrow}>Ти в клубі</span>
        <h1 className={styles.title}>Привіт, {user?.username}!</h1>
        <p className={styles.subtitle}>
          Тут з'явиться карта та стрічка активностей. А поки — усе працює: реєстрація, вхід, оновлення токена.
        </p>
        <button className={styles.logout} onClick={handleLogout} type="button">
          Вийти
        </button>
      </div>
    </div>
  );
}
