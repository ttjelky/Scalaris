import { useEffect, useMemo, useState } from 'react';

export default function useOsrmRoute(from, to, enabled = true) {
  const routeKey = useMemo(() => {
    if (!enabled || !from || !to) return null;
    return `${from[0]},${from[1]}->${to[0]},${to[1]}`;
  }, [enabled, from, to]);

  const [coords, setCoords] = useState(null);

  useEffect(() => {
    if (!routeKey) { setCoords(null); return; }
    const [fromStr, toStr] = routeKey.split('->');
    const [lat1, lng1] = fromStr.split(',').map(Number);
    const [lat2, lng2] = toStr.split(',').map(Number);
    const url = `https://router.project-osrm.org/route/v1/foot/${lng1},${lat1};${lng2},${lat2}?geometries=geojson&overview=full`;
    let cancelled = false;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.code === 'Ok' && data.routes?.length) {
          setCoords(data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]));
        } else {
          setCoords(null);
        }
      })
      .catch(() => { if (!cancelled) setCoords(null); });

    return () => { cancelled = true; };
  }, [routeKey]);

  return coords;
}
