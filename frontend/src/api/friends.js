import api from './axios';

export const getFriends = () => api.get('/users/me/friends/');

export const sendFriendRequest = (userId) => api.post(`/users/${userId}/friend-request/`);

export const acceptFriendRequest = (requestId) => api.post(`/users/friend-requests/${requestId}/accept/`);

export const rejectFriendRequest = (requestId) => api.delete(`/users/friend-requests/${requestId}/reject/`);

export const removeFriend = (userId) => api.delete(`/users/${userId}/friend/`);
