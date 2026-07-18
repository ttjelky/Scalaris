import { Circle, Marker, Polyline, Tooltip } from 'react-leaflet';

import { gatheringIcon } from './icons';
import useOsrmRoute from './useOsrmRoute';
// Side-effect import: the tooltip's global ".map-gathering-label" class is
// referenced by name (Leaflet renders tooltips outside React's tree).
import './GatheringLayer.module.css';

const ZONE_PATH_OPTIONS = {
  color: '#c6ff3d',
  fillColor: '#c6ff3d',
  fillOpacity: 0.15,
  weight: 2,
};

const ROUTE_PATH_OPTIONS = {
  color: '#0b0b0c',
  weight: 4,
  opacity: 0.8,
  lineCap: 'round',
  dashArray: '1, 10',
};

// `gathering`: { point: [lat, lng], title, category, acceptedIds, radius }
// for the currently ongoing "Збір". Renders the gathering point itself
// (a highlighted zone circle if category is 'zone', otherwise a pulsing
// marker with a title tooltip) and, for point gatherings, a walking route
// from the user's current `position` to it.
export default function GatheringLayer({ gathering, position }) {
  const isZone = gathering?.category === 'zone';
  const routeCoords = useOsrmRoute(
    position,
    gathering?.point,
    Boolean(gathering?.point) && !isZone,
  );

  if (!gathering) return null;

  return (
    <>
      {isZone ? (
        <Circle
          center={gathering.point}
          radius={gathering.radius || 80}
          pathOptions={ZONE_PATH_OPTIONS}
        />
      ) : (
        <Marker position={gathering.point} icon={gatheringIcon}>
          <Tooltip permanent direction="top" offset={[0, -16]} className="map-gathering-label">
            {gathering.title || 'Збір'}
          </Tooltip>
        </Marker>
      )}

      {routeCoords && (
        <Polyline positions={routeCoords} pathOptions={ROUTE_PATH_OPTIONS} />
      )}
    </>
  );
}
