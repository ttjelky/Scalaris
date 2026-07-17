import { forwardRef, useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import styles from './MapView.module.css';

// Small CSS dot markers instead of the default leaflet pin (which needs
// bundler-specific asset handling and was rendering broken under Vite).
const ownIcon = L.divIcon({
  className: `leaflet-dot-icon ${styles.ownMarker}`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const personIcon = L.divIcon({
  className: `leaflet-dot-icon ${styles.personMarker}`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// Bigger ring for people who accepted the current "Збір" invite, so they
// stand out among the plain nearby dots.
const acceptedPersonIcon = L.divIcon({
  className: `leaflet-dot-icon ${styles.personMarkerAccepted}`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// The gathering point itself — bigger, pulsing, visually distinct from
// both "me" and "other people" dots.
const gatheringIcon = L.divIcon({
  className: `leaflet-dot-icon ${styles.gatheringMarker}`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const INITIAL_ZOOM = 14;
// Below this zoom level, dots are packed close together and a nickname
// per marker would just clutter the map — labels only kick in once
// there's enough space between points to actually read them.
const LABEL_ZOOM_THRESHOLD = 15;

// Minimum movement (meters) before we bother asking OSRM for a fresh route,
// plus a hard time-based ceiling — keeps this polite to the public router
// even while geolocation is ticking every few seconds.
const ROUTE_REFETCH_DISTANCE_M = 30;
const ROUTE_REFETCH_INTERVAL_MS = 15000;

function haversineMeters([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Fetches a real road route from `from` to `to` via the public OSRM demo
// server, re-fetching only when the traveler has actually moved a bit or
// enough time has passed — not on every single geolocation tick.
function useRoadRoute(from, to) {
  const [route, setRoute] = useState(null);
  const lastOrigin = useRef(null);
  const lastFetchAt = useRef(0);

  useEffect(() => {
    if (!from || !to) {
      setRoute(null);
      lastOrigin.current = null;
      return undefined;
    }

    const now = Date.now();
    const movedFar = !lastOrigin.current || haversineMeters(lastOrigin.current, from) > ROUTE_REFETCH_DISTANCE_M;
    const staleEnough = now - lastFetchAt.current > ROUTE_REFETCH_INTERVAL_MS;
    if (!movedFar && !staleEnough) return undefined;

    let cancelled = false;
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const coords = data?.routes?.[0]?.geometry?.coordinates;
        if (coords) {
          setRoute(coords.map(([lng, lat]) => [lat, lng]));
          lastOrigin.current = from;
          lastFetchAt.current = Date.now();
        }
      })
      .catch(() => {
        // best-effort — leave whatever route we already have on screen
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.[0], from?.[1], to?.[0], to?.[1]]);

  return route;
}

function RecenterOnMove({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, map.getZoom(), { animate: true });
  }, [position, map]);
  return null;
}

// Not rendered — just listens for zoom changes and reports them up, so
// MapView can decide whether nickname labels should be visible.
function ZoomWatcher({ onZoomChange }) {
  useMapEvents({
    zoomend: (e) => onZoomChange(e.target.getZoom()),
  });
  return null;
}

// `ref` is forwarded straight onto react-leaflet's MapContainer, so callers
// keep using it exactly as before (e.g. mapRef.current.setView(...)).
//
// `gathering` (optional): { point: [lat, lng], title, acceptedIds } for the
// currently ongoing "Збір". When present, shows the gathering point, a road
// route from `position` to it, and highlights nearbyUsers whose id is in
// acceptedIds.
const MapView = forwardRef(function MapView({ position, nearbyUsers, gathering, className }, ref) {
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const showLabels = zoom >= LABEL_ZOOM_THRESHOLD;
  const roadRoute = useRoadRoute(position, gathering?.point || null);
  const acceptedIds = gathering?.acceptedIds || [];

  return (
    <MapContainer
      ref={ref}
      center={position}
      zoom={INITIAL_ZOOM}
      zoomControl={false}
      className={className || styles.map}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <ZoomWatcher onZoomChange={setZoom} />
      <Marker position={position} icon={ownIcon} />

      {gathering && (
        <>
          {roadRoute && (
            <Polyline positions={roadRoute} pathOptions={{ className: styles.routeLine }} />
          )}
          <Marker position={gathering.point} icon={gatheringIcon}>
            <Tooltip permanent direction="top" offset={[0, -16]} className="map-gathering-label">
              {gathering.title || 'Збір'}
            </Tooltip>
          </Marker>
        </>
      )}

      {nearbyUsers.map((person) => {
        const isAccepted = acceptedIds.includes(person.id);
        return (
          <Marker
            key={person.id}
            position={[person.latitude, person.longitude]}
            icon={isAccepted ? acceptedPersonIcon : personIcon}
            eventHandlers={{
              click: () => navigate(`/profile/${person.id}`),
            }}
          >
            {showLabels && (
              <Tooltip permanent direction="top" offset={[0, -12]} className="map-user-label">
                {person.username}
              </Tooltip>
            )}
          </Marker>
        );
      })}
      <RecenterOnMove position={position} />
    </MapContainer>
  );
});

export default MapView;
