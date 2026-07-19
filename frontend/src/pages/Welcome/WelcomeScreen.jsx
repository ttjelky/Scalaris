import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import logo from '../../assets/scalaris-logo.svg';
import useDocumentBackground from '../../hooks/useDocumentBackground';
import useSlideshow from '../../hooks/useSlideshow';
import styles from './WelcomeScreen.module.css';

import slide1 from '../../assets/welcome/street-1.webp';
import slide2 from '../../assets/welcome/street-2.webp';
import slide3 from '../../assets/welcome/street-3.webp';
import slide4 from '../../assets/welcome/street-4.webp';

const DEFAULT_SLIDES = [slide1, slide2, slide3, slide4];

export default function WelcomeScreen({ images, backgroundImage }) {
  useDocumentBackground('#0e0e10');
  const slides = images ?? (backgroundImage ? [backgroundImage] : DEFAULT_SLIDES);

  const reduceMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const activeIndex = useSlideshow(slides.length, {
    intervalMs: 5000,
    enabled: !reduceMotion,
  });

  return (
    <div className={styles.screen}>
      <div className={styles.slideshow} aria-hidden="true">
        {slides.map((src, i) => (
          <div
            key={src}
            className={styles.slide}
            style={{ backgroundImage: `url(${src})`, opacity: i === activeIndex ? 1 : 0 }}
          />
        ))}
      </div>

      <div className={styles.overlay} />

      <header className={styles.header}>
        <img src={logo} alt="Scalaris" className={styles.logo} />
      </header>

      <div className={styles.content}>
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
