export const PARTICIPANT_STATUS = {
  pending: { label: 'очікування', className: 'statusPending' },
  accepted: { label: 'прийнято', className: 'statusAccepted' },
  arrived: { label: 'на місці', className: 'statusArrived' },
  declined: { label: 'відхилено', className: 'statusDeclined' },
  left: { label: 'вийшов(ла)', className: 'statusLeft' },
};

export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDurationLong(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h} год ${m} хв`;
  if (m > 0) return `${m} хв ${s} с`;
  return `${s} с`;
}

// Great-circle distance (km) between two [lat, lng] points, used to show
// how far the user currently is from an ongoing gathering's location.
export function haversineDistanceKm([lat1, lon1], [lat2, lon2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(km) {
  if (km == null || Number.isNaN(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} м`;
  return `${km.toFixed(km < 10 ? 1 : 0)} км`;
}
