import { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';

// Auto-centers the map exactly once — when the very first GPS fix comes
// in. `position` keeps updating every few seconds from watchPosition, but
// re-centering on every one of those ticks was yanking the map back mid-
// drag on mobile, making it impossible to pan around. Manual re-centering
// afterwards is handled by the "show my location" button (see recenterToMe
// in Home.jsx), which drives the map ref directly.
export function RecenterOnMove({ position }) {
  const map = useMap();
  const hasCenteredOnce = useRef(false);

  useEffect(() => {
    if (!position || hasCenteredOnce.current) return;
    hasCenteredOnce.current = true;
    map.setView(position, map.getZoom(), { animate: true });
  }, [position, map]);

  return null;
}

// Not rendered — just listens for zoom changes and reports them up, so
// MapView can decide whether nickname labels should be visible.
export function ZoomWatcher({ onZoomChange }) {
  useMapEvents({
    zoomend: (e) => onZoomChange(e.target.getZoom()),
  });
  return null;
}
