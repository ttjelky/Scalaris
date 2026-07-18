import api from './axios';

export const getNotifications = () => api.get('/users/me/notifications/');

export const getNotificationsCount = () => api.get('/users/me/notifications/count/');

export const acceptFriendRequest = (requestId) => api.post(`/users/friend-requests/${requestId}/accept/`);

export const declineFriendRequest = (requestId) => api.delete(`/users/friend-requests/${requestId}/reject/`);

export const acceptInvitation = (invitationId) =>
  api.patch(`/activities/invitations/${invitationId}/respond/`, { status: 'accepted' });

export const declineInvitation = (invitationId) =>
  api.patch(`/activities/invitations/${invitationId}/respond/`, { status: 'declined' });
