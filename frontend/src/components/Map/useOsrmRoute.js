import { useEffect, useMemo, useState } from 'react';

// Fetches a foot-travel route between two [lat, lng] points from the public
// OSRM demo server and returns it as an array of [lat, lng] pairs (or null
// while there's nothing to show — missing endpoints, `enabled` is false, or
// the request failed/returned no route).
//
// `enabled` lets a caller skip the request entirely — e.g. there's no
// active checkpoint, or the gathering is a zone rather than a point.
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
