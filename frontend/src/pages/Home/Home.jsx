import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NearbyMap from '../../components/Map/Nearbymap';
import styles from './Home.module.css';

/**
 * Головний екран для залогіненого користувача.
 * Карта займає весь екран, зверху — плаваюча панель з привітанням і виходом.
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
      <NearbyMap />

      <header className={styles.topBar}>
        <div className={styles.greeting}>
          <span className={styles.eyebrow}>Ти в клубі</span>
          <p className={styles.username}>{user?.username}</p>
        </div>
        <button className={styles.logout} onClick={handleLogout} type="button">
          Вийти
        </button>
      </header>
    </div>
  );
}