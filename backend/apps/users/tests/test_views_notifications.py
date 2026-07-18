"""Тести сповіщень (список + лічильник), включно з активностями."""
from django.utils import timezone

from ..models import FriendRequest
from .base import KYIV_LAT, KYIV_LNG, BaseAPITestCase, make_point


class NotificationsTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user(username='alice', email='alice@example.com')
        self.bob = self.create_user(username='bob', email='bob@example.com')
        self.login('alice')

    def test_count_reflects_pending_friend_requests(self):
        FriendRequest.objects.create(from_user=self.bob, to_user=self.alice)
        response = self.client.get('/api/users/me/notifications/count/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)

    def test_notifications_list_contains_friend_request_entry(self):
        FriendRequest.objects.create(from_user=self.bob, to_user=self.alice)
        response = self.client.get('/api/users/me/notifications/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['type'], 'friend_request')
        self.assertEqual(response.data[0]['from_user']['username'], 'bob')

    def test_notifications_count_zero_when_none(self):
        response = self.client.get('/api/users/me/notifications/count/')
        self.assertEqual(response.data['count'], 0)


class NotificationsWithActivityInvitationTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user(username='alice', email='alice@example.com')
        self.bob = self.create_user(username='bob', email='bob@example.com')
        self.login('alice')

    def test_notifications_include_activity_invitation(self):
        from apps.activities.models import Activity, Invitation
        activity = Activity.objects.create(
            creator=self.bob, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        Invitation.objects.create(from_user=self.bob, to_user=self.alice, activity=activity)

        response = self.client.get('/api/users/me/notifications/')
        self.assertEqual(response.status_code, 200)
        types = [n['type'] for n in response.data]
        self.assertIn('activity_invitation', types)

    def test_notifications_count_includes_invitations(self):
        from apps.activities.models import Activity, Invitation
        activity = Activity.objects.create(
            creator=self.bob, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        Invitation.objects.create(from_user=self.bob, to_user=self.alice, activity=activity)

        response = self.client.get('/api/users/me/notifications/count/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
