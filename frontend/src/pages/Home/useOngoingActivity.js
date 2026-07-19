import { useEffect, useMemo, useState } from 'react';
import api from '../../../api/axios';
import useActivitySocket from '../../../hooks/useActivitySocket';
import useElapsedTime from '../../../hooks/useElapsedTime';
import { haversineDistanceKm, formatDistance } from '../../../utils/activity';

/**
 * Owns the full lifecycle of the "ongoing activity" (a.k.a. "Збір") view:
 * restoring it on mount, keeping it in sync over the activity WebSocket,
 * auto-expiring cross-activities client-side, leaving/deleting it, and the
 * derived data the map and sheet header need.
 *
 * @param {{
 *   user: object | null,
 *   position: [number, number] | null,
 *   setSheetState: Function,
 *   setHideNonParticipants: Function,
 * }} params
 */
export default function useOngoingActivity({ user, position, setSheetState, setHideNonParticipants }) {
  const [ongoingActivity, setOngoingActivity] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const ongoingElapsed = useElapsedTime(ongoingActivity?.started_at);

  const isCreator = ongoingActivity && user && ongoingActivity.creator?.id === user.id;

  // Переживає перезавантаження сторінки: React-стейт сам по собі зникає
  // при reload, тож на кожен маунт питаємо бекенд, чи є в мене зараз
  // live-збір, і якщо є — одразу показуємо ongoing-вʼю замість людей поруч.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/activities/my-active/');
        if (!cancelled && data) {
          setOngoingActivity(data);
        }
      } catch {
        // немає активного збору (або запит не вдався) — лишаємось на дефолтному екрані
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-expire cross activities on the client side when countdown hits 0.
  useEffect(() => {
    if (!ongoingActivity) return;
    if (ongoingActivity.category !== 'cross' || !ongoingActivity.duration_seconds) return;
    const remaining = ongoingActivity.duration_seconds * 1000 - ongoingElapsed;
    if (remaining > 0) return;
    setOngoingActivity(null);
    setSheetState('collapsed');
  }, [ongoingElapsed, ongoingActivity, setSheetState]);

  // Real-time participant updates via WebSocket (replaces 6-second polling).
  const { participants: wsParticipants, cancelled: wsCancelled } =
    useActivitySocket(ongoingActivity?.id || null);

  // Merge WebSocket updates into ongoingActivity state.
  useEffect(() => {
    if (!ongoingActivity?.id) return;
    if (wsParticipants.length > 0) {
      setOngoingActivity((prev) => (prev && prev.id === ongoingActivity.id ? { ...prev, participants: wsParticipants } : prev));
    }
  }, [wsParticipants, ongoingActivity?.id]);

  useEffect(() => {
    if (wsCancelled && ongoingActivity) {
      setOngoingActivity(null);
      setSheetState('collapsed');
    }
  }, [wsCancelled, ongoingActivity, setSheetState]);

  // Distance from the user's current position to the ongoing gathering's
  // point, shown under the "Збір" title in the sheet header.
  const ongoingDistanceLabel = useMemo(() => {
    if (!position || !ongoingActivity?.latitude || !ongoingActivity?.longitude) return null;
    const km = haversineDistanceKm(position, [ongoingActivity.latitude, ongoingActivity.longitude]);
    return formatDistance(km);
  }, [position, ongoingActivity]);

  // Participant count for the ongoing gathering, shown in place of the
  // back arrow while the sheet is collapsed.
  const ongoingParticipantsCount = useMemo(
    () => (ongoingActivity?.participants || []).length,
    [ongoingActivity]
  );

  // Point + accepted-participant ids for the map, derived from the ongoing
  // activity. null when there's nothing to show.
  const gatheringMapData = useMemo(() => {
    if (!ongoingActivity) return null;
    return {
      point: [ongoingActivity.latitude, ongoingActivity.longitude],
      title: ongoingActivity.title,
      category: ongoingActivity.category,
      description: ongoingActivity.description,
      radius: ongoingActivity.geofence_radius_m,
      creator: ongoingActivity.creator,
      participantCount: (ongoingActivity.participants || []).length,
      acceptedIds: (ongoingActivity.participants || [])
        .filter((p) => p.status === 'accepted' || p.status === 'arrived')
        .map((p) => p.id),
    };
  }, [ongoingActivity]);

  const checkpointsMapData = useMemo(() => {
    if (!ongoingActivity || ongoingActivity.category !== 'cross') return null;
    const cps = ongoingActivity.checkpoints || [];
    if (cps.length === 0) return null;

    // Find passed checkpoint IDs (from the creator's or first participant's perspective)
    const me = (ongoingActivity.participants || []).find((p) => p.id === user?.id);
    const myPassed = me?.passed_checkpoints || [];

    // Current = first checkpoint not yet passed
    const current = cps.find((cp) => !myPassed.includes(cp.id)) || null;

    return {
      items: cps,
      currentId: current?.id || null,
      passedIds: myPassed,
      userPosition: position,
    };
  }, [ongoingActivity, user?.id, position]);

  const handleLeaveActivity = async () => {
    if (!ongoingActivity?.id || leaving) return;
    setLeaving(true);
    try {
      await api.post(`/activities/${ongoingActivity.id}/leave/`);
    } catch {
      // best-effort — ховаємо локально в будь-якому разі, щоб не залипало в UI
    } finally {
      setLeaving(false);
      setOngoingActivity(null);
      setHideNonParticipants(false);
      setSheetState('collapsed');
    }
  };

  const handleDeleteActivity = async () => {
    if (!ongoingActivity?.id || leaving) return;
    setLeaving(true);
    setOngoingActivity(null);
    setHideNonParticipants(false);
    setSheetState('collapsed');
    try {
      await api.delete(`/activities/${ongoingActivity.id}/`);
    } catch {
      // ignore
    } finally {
      setLeaving(false);
    }
  };

  return {
    ongoingActivity,
    setOngoingActivity,
    ongoingElapsed,
    isCreator,
    leaving,
    ongoingDistanceLabel,
    ongoingParticipantsCount,
    gatheringMapData,
    checkpointsMapData,
    handleLeaveActivity,
    handleDeleteActivity,
  };
}
