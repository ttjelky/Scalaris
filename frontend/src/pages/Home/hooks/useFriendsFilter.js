import { useEffect, useMemo, useState } from 'react';
import { getFriends } from '../../../api/friends';

/**
 * Owns the "nearby users" filtering side of the sheet: the friends list,
 * the friends-only / participants-only toggles, and the filtered list +
 * label derived from them.
 *
 * @param {{
 *   nearbyUsers: Array,
 *   ongoingActivity: object | null,
 *   hideNonParticipants: boolean,
 * }} params
 */
export default function useFriendsFilter({ nearbyUsers, ongoingActivity, hideNonParticipants }) {
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [friendsList, setFriendsList] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getFriends()
      .then(({ data }) => {
        if (!cancelled) {
          setFriendsList(Array.isArray(data) ? data : data.results || []);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const friendIdSet = useMemo(() => new Set(friendsList.map((f) => f.id)), [friendsList]);

  const activityParticipantIds = useMemo(() => {
    if (!ongoingActivity) return null;
    const activeStatuses = new Set(['accepted', 'arrived']);
    const ids = (ongoingActivity.participants || [])
      .filter((p) => activeStatuses.has(p.status))
      .map((p) => p.id);
    if (ongoingActivity.creator?.id && !ids.includes(ongoingActivity.creator.id)) {
      ids.push(ongoingActivity.creator.id);
    }
    return new Set(ids);
  }, [ongoingActivity]);

  const nearbyUsersFiltered = useMemo(() => {
    let list = nearbyUsers;
    if (friendsOnly) {
      list = list.filter((u) => friendIdSet.has(u.id));
    }
    if (hideNonParticipants && activityParticipantIds) {
      list = list.filter((u) => activityParticipantIds.has(u.id));
    }
    return list;
  }, [nearbyUsers, friendsOnly, friendIdSet, hideNonParticipants, activityParticipantIds]);

  const nearbyCount = useMemo(() => nearbyUsersFiltered.length, [nearbyUsersFiltered]);

  const filterLabel = hideNonParticipants && friendsOnly
    ? 'Друзі · Учасники'
    : hideNonParticipants
      ? 'Учасники'
      : friendsOnly
        ? 'Лише друзі'
        : null;

  return {
    friendsOnly,
    setFriendsOnly,
    nearbyUsersFiltered,
    nearbyCount,
    filterLabel,
  };
}
