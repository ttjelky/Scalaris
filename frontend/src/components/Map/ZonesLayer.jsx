import { Circle } from 'react-leaflet';

import './ZonesLayer.module.css';

const ZONE_PATH_OPTIONS = {
  color: '#c6ff3d',
  fillColor: '#c6ff3d',
  fillOpacity: 0.15,
  weight: 2,
};

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
