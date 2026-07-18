"""Тести InvitationViewSet: list, respond."""
from django.utils import timezone

from ..models import Activity, Invitation
from .base import BaseActivityTestCase, KYIV_LAT, KYIV_LNG, make_point


class InvitationViewSetTests(BaseActivityTestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user('alice')
        self.bob = self.create_user('bob')
        self.activity = Activity.objects.create(
            creator=self.alice, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.PENDING,
        )
        self.invitation = Invitation.objects.create(
            from_user=self.alice, to_user=self.bob, activity=self.activity,
        )

    def test_list_includes_invitations_as_sender(self):
        self.login('alice')
        response = self.client.get('/api/activities/invitations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 1)

    def test_list_includes_invitations_as_receiver(self):
        self.login('bob')
        response = self.client.get('/api/activities/invitations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 1)

    def test_unrelated_user_sees_no_invitations(self):
        self.create_user('carol')
        self.login('carol')
        response = self.client.get('/api/activities/invitations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 0)

    def test_receiver_can_accept(self):
        self.login('bob')
        response = self.client.patch(f'/api/activities/invitations/{self.invitation.pk}/respond/', {
            'status': Invitation.Status.ACCEPTED,
        })
        self.assertEqual(response.status_code, 200)
        self.invitation.refresh_from_db()
        self.assertEqual(self.invitation.status, Invitation.Status.ACCEPTED)
        self.activity.refresh_from_db()
        self.assertEqual(self.activity.live_status, Activity.LiveStatus.ACTIVE)

    def test_receiver_can_decline(self):
        self.login('bob')
        response = self.client.patch(f'/api/activities/invitations/{self.invitation.pk}/respond/', {
            'status': Invitation.Status.DECLINED,
        })
        self.assertEqual(response.status_code, 200)
        self.invitation.refresh_from_db()
        self.assertEqual(self.invitation.status, Invitation.Status.DECLINED)

    def test_sender_cannot_respond_to_own_invitation(self):
        self.login('alice')
        response = self.client.patch(f'/api/activities/invitations/{self.invitation.pk}/respond/', {
            'status': Invitation.Status.ACCEPTED,
        })
        self.assertEqual(response.status_code, 403)

    def test_invalid_status_value_rejected(self):
        self.login('bob')
        response = self.client.patch(f'/api/activities/invitations/{self.invitation.pk}/respond/', {
            'status': Invitation.Status.ARRIVED,
        })
        self.assertEqual(response.status_code, 400)
