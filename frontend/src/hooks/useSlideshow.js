import { useEffect, useState } from 'react';

/**
 * Cycles an index from 0..count-1 on a fixed interval. Used to drive a
 * crossfading background slideshow.
 *
 * @param {number} count - how many slides there are
 * @param {{ intervalMs?: number, enabled?: boolean }} options
 */
export default function useSlideshow(count, { intervalMs = 5000, enabled = true } = {}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!enabled || count <= 1) return undefined;

    const id = setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, intervalMs);

    return () => clearInterval(id);
  }, [count, intervalMs, enabled]);

  return index;
}
