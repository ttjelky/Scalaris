import { useEffect, useState } from 'react';

// Ticks once a second while an activity is ongoing, giving back the
// elapsed time in ms since its started_at.
export default function useElapsedTime(startedAt) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return undefined;
    }
    const startMs = new Date(startedAt).getTime();
    const update = () => setElapsed(Math.max(0, Date.now() - startMs));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}
