import { useMemo, useState } from 'react';
import api from '../../../api/axios';

/**
 * Owns the "selected game zone" side of the bottom sheet: which zone is
 * selected, the list filtered of hidden/deleted zones, and the
 * hide/delete actions for a zone.
 *
 * @param {{
 *   activeZones: Array,
 *   setActiveZones: Function,
 *   hiddenZoneIds: Set<number>,
 *   setHiddenZoneIds: Function,
 *   deletedZoneIds: Set<number>,
 *   user: object | null,
 *   setSheetState: Function,
 * }} params
 */
export default function useZonePanel({
  activeZones,
  setActiveZones,
  hiddenZoneIds,
  setHiddenZoneIds,
  deletedZoneIds,
  user,
  setSheetState,
}) {
  const [selectedZone, setSelectedZone] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const visibleZones = useMemo(
    () => activeZones.filter((z) => !hiddenZoneIds.has(z.id) && !deletedZoneIds.has(z.id)),
    [activeZones, hiddenZoneIds, deletedZoneIds]
  );

  const isZoneCreator = selectedZone && user && selectedZone.creator?.id === user.id;

  const handleZoneClick = (zone) => {
    setSelectedZone(zone);
    setSheetState('expanded');
  };

  const handleHideZone = async (zone) => {
    setHiddenZoneIds((prev) => new Set([...prev, zone.id]));
    setSelectedZone(null);
    setSheetState('collapsed');
    try {
      await api.post(`/activities/${zone.id}/hide/`);
    } catch {
      // ignore
    }
  };

  const handleDeleteZone = async (zone) => {
    setDeleting(true);
    setActiveZones((prev) => prev.filter((z) => z.id !== zone.id));
    setSelectedZone(null);
    setSheetState('collapsed');
    try {
      await api.delete(`/activities/${zone.id}/`);
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  return {
    selectedZone,
    setSelectedZone,
    visibleZones,
    isZoneCreator,
    deleting,
    handleZoneClick,
    handleHideZone,
    handleDeleteZone,
  };
}
