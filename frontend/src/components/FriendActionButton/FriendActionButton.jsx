import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '../../api/friends';
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog';
import styles from './FriendActionButton.module.css';

export default function FriendActionButton({ userId, friendshipStatus, friendRequestId, onStatusChange }) {
  const [status, setStatus] = useState(friendshipStatus || 'none');
  const [requestId, setRequestId] = useState(friendRequestId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmingRemove, setConfirmingRemove] = useState(false);

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
      setConfirmingRemove(false);
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
    return (
      <div className={styles.wrap}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.friendBadge}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Друг
        </div>
        <button
          className={styles.removeFriend}
          onClick={() => setConfirmingRemove(true)}
          type="button"
          disabled={loading}
        >
          {loading ? 'Видаляємо…' : 'Видалити з друзів'}
        </button>

        {confirmingRemove && createPortal(
          <ConfirmDialog
            title="Видалити з друзів?"
            text="Ви більше не будете бачити одне одного у списку друзів. Надіслати запит повторно можна буде будь-коли."
            confirmLabel="Так, видалити"
            loadingLabel="Видаляємо…"
            loading={loading}
            onConfirm={onRemoveFriend}
            onCancel={() => setConfirmingRemove(false)}
          />,
          document.body,
        )}
      </div>
    );
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
