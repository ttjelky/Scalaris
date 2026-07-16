import { forwardRef, useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
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

const INITIAL_ZOOM = 14;
// Below this zoom level, dots are packed close together and a nickname
// per marker would just clutter the map — labels only kick in once
// there's enough space between points to actually read them.
const LABEL_ZOOM_THRESHOLD = 15;

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
const MapView = forwardRef(function MapView({ position, nearbyUsers, className }, ref) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const showLabels = zoom >= LABEL_ZOOM_THRESHOLD;

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
      {nearbyUsers.map((person) => (
        <Marker key={person.id} position={[person.latitude, person.longitude]} icon={personIcon}>
          {showLabels && (
            <Tooltip permanent direction="top" offset={[0, -12]} className="map-user-label">
              {person.username}
            </Tooltip>
          )}
        </Marker>
      ))}
      <RecenterOnMove position={position} />
    </MapContainer>
  );
});

export default MapView;
