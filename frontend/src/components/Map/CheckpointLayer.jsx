import { Marker, Polyline, Tooltip } from 'react-leaflet';

import { makeCheckpointIcon } from './icons';
import useOsrmRoute from './useOsrmRoute';
// Side-effect import: the tooltip's global ".map-checkpoint-label" class is
// referenced by name (Leaflet renders tooltips outside React's tree), so
// nothing here uses the `styles` export — this just gets the CSS bundled.
import './CheckpointLayer.module.css';

const ROUTE_PATH_OPTIONS = {
  color: '#0b0b0c',
  weight: 4,
  opacity: 0.8,
  lineCap: 'round',
  dashArray: '1, 10',
};

// Numbered markers for every checkpoint in a cross activity, plus a walking
// route from `userPosition` to whichever one is current.
export default function CheckpointLayer({ checkpoints, currentCheckpointId, passedCheckpointIds, userPosition }) {
  const currentCheckpoint = checkpoints?.find((cp) => cp.id === currentCheckpointId) || null;
  const currentCheckpointPos = currentCheckpoint
    ? [currentCheckpoint.latitude, currentCheckpoint.longitude]
    : null;
  const routeCoords = useOsrmRoute(userPosition, currentCheckpointPos, Boolean(currentCheckpointId));

  if (!checkpoints || checkpoints.length === 0) return null;

  return (
    <>
      {checkpoints.map((cp) => {
        const isCurrent = cp.id === currentCheckpointId;
        const isPassed = passedCheckpointIds.includes(cp.id);
        return (
          <Marker
            key={`cp-${cp.id}`}
            position={[cp.latitude, cp.longitude]}
            icon={makeCheckpointIcon(cp.order, isCurrent, isPassed)}
          >
            {!isCurrent && (
              <Tooltip permanent direction="top" offset={[0, -18]} className="map-checkpoint-label">
                #{cp.order}
              </Tooltip>
            )}
          </Marker>
        );
      })}

      {routeCoords && (
        <Polyline positions={routeCoords} pathOptions={ROUTE_PATH_OPTIONS} />
      )}
    </>
  );
}
