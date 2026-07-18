"""Тести системи друзів: запити, авто-прийняття, блокування, видалення."""
from ..models import Block, FriendRequest
from .base import BaseAPITestCase


class FriendSystemTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user(username='alice', email='alice@example.com')
        self.bob = self.create_user(username='bob', email='bob@example.com')
        self.login('alice')

    def _login_as(self, username):
        self.client.credentials()
        self.login(username)

    def test_send_and_accept_friend_request(self):
        response = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['friendship_status'], 'request_sent')

        self._login_as('bob')

        profile = self.client.get(f'/api/users/{self.alice.pk}/')
        self.assertEqual(profile.data['friendship_status'], 'request_received')
        request_id = profile.data['friend_request_id']

        response = self.client.post(f'/api/users/friend-requests/{request_id}/accept/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.alice.friends.filter(pk=self.bob.pk).exists())

        friends = self.client.get('/api/users/me/friends/')
        self.assertEqual(friends.status_code, 200)
        usernames = [u['username'] for u in friends.data['results']]
        self.assertIn('alice', usernames)

    def test_auto_accept_when_both_users_send_requests(self):
        FriendRequest.objects.create(from_user=self.bob, to_user=self.alice)
        response = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['friendship_status'], 'friends')
        self.assertTrue(self.alice.friends.filter(pk=self.bob.pk).exists())
        # Обидва зустрічні запити мають бути прибрані.
        self.assertEqual(FriendRequest.objects.count(), 0)

    def test_cannot_send_request_to_self(self):
        response = self.client.post(f'/api/users/{self.alice.pk}/friend-request/')
        self.assertEqual(response.status_code, 400)

    def test_cannot_send_request_if_already_friends(self):
        self.alice.friends.add(self.bob)
        response = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(response.status_code, 400)

    def test_cannot_send_request_to_user_who_blocked_me(self):
        Block.objects.create(blocker=self.bob, blocked=self.alice)
        response = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(response.status_code, 403)

    def test_cannot_send_request_to_user_i_blocked(self):
        Block.objects.create(blocker=self.alice, blocked=self.bob)
        response = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(response.status_code, 400)

    def test_sending_same_request_twice_returns_200_not_created(self):
        first = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(first.status_code, 201)
        second = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(FriendRequest.objects.count(), 1)

    def test_reject_request_by_receiver(self):
        fr = FriendRequest.objects.create(from_user=self.alice, to_user=self.bob)
        self._login_as('bob')
        response = self.client.delete(f'/api/users/friend-requests/{fr.pk}/reject/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(FriendRequest.objects.filter(pk=fr.pk).exists())

    def test_cancel_request_by_sender(self):
        fr = FriendRequest.objects.create(from_user=self.alice, to_user=self.bob)
        response = self.client.delete(f'/api/users/friend-requests/{fr.pk}/reject/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(FriendRequest.objects.filter(pk=fr.pk).exists())

    def test_unrelated_user_cannot_reject_request(self):
        fr = FriendRequest.objects.create(from_user=self.alice, to_user=self.bob)
        charlie = self.create_user(username='charlie', email='charlie@example.com')
        self._login_as('charlie')
        response = self.client.delete(f'/api/users/friend-requests/{fr.pk}/reject/')
        self.assertEqual(response.status_code, 404)

    def test_remove_friend(self):
        self.alice.friends.add(self.bob)
        response = self.client.delete(f'/api/users/{self.bob.pk}/friend/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(self.alice.friends.filter(pk=self.bob.pk).exists())
        self.assertFalse(self.bob.friends.filter(pk=self.alice.pk).exists())

    def test_sent_and_received_lists(self):
        FriendRequest.objects.create(from_user=self.alice, to_user=self.bob)
        sent = self.client.get('/api/users/me/friend-requests/sent/')
        self.assertEqual(sent.status_code, 200)
        self.assertEqual(len(sent.data['results']), 1)

        self._login_as('bob')
        received = self.client.get('/api/users/me/friend-requests/received/')
        self.assertEqual(received.status_code, 200)
        self.assertEqual(len(received.data['results']), 1)
