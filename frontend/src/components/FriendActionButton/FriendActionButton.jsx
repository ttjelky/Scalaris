import { useEffect, useState } from 'react';
import {
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '../../api/friends';
import styles from './FriendActionButton.module.css';

export default function FriendActionButton({ userId, friendshipStatus, friendRequestId, onStatusChange }) {
  const [status, setStatus] = useState(friendshipStatus || 'none');
  const [requestId, setRequestId] = useState(friendRequestId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setStatus(friendshipStatus || 'none');
    setRequestId(friendRequestId);
  }, [friendshipStatus, friendRequestId, userId]);

  const updateStatus = (nextStatus, nextRequestId = null) => {
    setStatus(nextStatus);
    setRequestId(nextRequestId);
    onStatusChange?.(nextStatus, nextRequestId);
  };

  const onSendRequest = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await sendFriendRequest(userId);
      updateStatus(data.friendship_status || 'request_sent', data.friend_request_id ?? null);
    } catch {
      setError('Не вдалося надіслати запит.');
    } finally {
      setLoading(false);
    }
  };

  const onAcceptRequest = async () => {
    if (!requestId) return;
    setLoading(true);
    setError('');
    try {
      await acceptFriendRequest(requestId);
      updateStatus('friends', null);
    } catch {
      setError('Не вдалося прийняти запит.');
    } finally {
      setLoading(false);
    }
  };

  const onCancelRequest = async () => {
    if (!requestId) return;
    setLoading(true);
    setError('');
    try {
      await rejectFriendRequest(requestId);
      updateStatus('none', null);
    } catch {
      setError('Не вдалося скасувати запит.');
    } finally {
      setLoading(false);
    }
  };

  const onRemoveFriend = async () => {
    setLoading(true);
    setError('');
    try {
      await removeFriend(userId);
      updateStatus('none', null);
    } catch {
      setError('Не вдалося видалити з друзів.');
    } finally {
      setLoading(false);
    }
  };

  let buttonLabel = 'Додати в друзі';
  let buttonClass = styles.primary;
  let onClick = onSendRequest;
  let disabled = loading;

  if (status === 'request_sent') {
    buttonLabel = loading ? 'Скасовуємо…' : 'Запит надіслано';
    buttonClass = styles.pending;
    onClick = onCancelRequest;
  } else if (status === 'request_received') {
    buttonLabel = loading ? 'Приймаємо…' : 'Прийняти запит';
    buttonClass = styles.primary;
    onClick = onAcceptRequest;
  } else if (status === 'friends') {
    buttonLabel = loading ? 'Видаляємо…' : 'Друзі';
    buttonClass = styles.friends;
    onClick = onRemoveFriend;
  } else if (loading) {
    buttonLabel = 'Надсилаємо…';
  }

  return (
    <div className={styles.wrap}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button
        className={`${styles.button} ${buttonClass}`}
        onClick={onClick}
        type="button"
        disabled={disabled}
      >
        {buttonLabel}
      </button>
      {status === 'request_received' && requestId && (
        <button
          className={styles.secondary}
          onClick={onCancelRequest}
          type="button"
          disabled={loading}
        >
          Відхилити
        </button>
      )}
    </div>
  );
}
