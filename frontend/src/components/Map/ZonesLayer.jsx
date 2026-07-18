import { Circle } from 'react-leaflet';

// Side-effect import: keeps the prepared (not yet wired-in) zone-popup
// styles in ZonesLayer.module.css bundled, same as before the split.
import './ZonesLayer.module.css';

const ZONE_PATH_OPTIONS = {
  color: '#c6ff3d',
  fillColor: '#c6ff3d',
  fillOpacity: 0.15,
  weight: 2,
};

// Renders every "Ігрова зона" circle visible to everyone on the map.
// `onZoneClick` is left to the caller (see MapView.jsx / Home.jsx) since
// what happens on click — opening a details panel, a modal, etc. — is
// app-specific rather than map-specific.
export default function ZonesLayer({ zones, onZoneClick }) {
  if (!zones || zones.length === 0) return null;

  return zones.map((zone) => (
    <Circle
      key={zone.id}
      center={[zone.latitude, zone.longitude]}
      radius={zone.radius || 80}
      pathOptions={ZONE_PATH_OPTIONS}
      eventHandlers={{
        click: () => onZoneClick?.(zone),
      }}
    />
  ));
}
