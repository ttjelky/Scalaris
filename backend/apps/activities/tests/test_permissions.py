"""Тести дозволів: IsCreatorOrReadOnly, IsInvitationReceiver."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from ..models import Activity, Invitation
from ..permissions import IsCreatorOrReadOnly, IsInvitationReceiver
from .base import KYIV_LAT, KYIV_LNG, make_point

User = get_user_model()


class PermissionTests(TestCase):
    def setUp(self):
        self.creator = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.other = User.objects.create_user(username='bob', email='b@example.com', password='pw')
        self.activity = Activity.objects.create(
            creator=self.creator, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
        )
        self.invitation = Invitation.objects.create(from_user=self.creator, to_user=self.other, activity=self.activity)
        self.factory = APIRequestFactory()

    def test_creator_or_read_only_allows_safe_methods_for_anyone(self):
        request = self.factory.get('/')
        request.user = self.other
        self.assertTrue(IsCreatorOrReadOnly().has_object_permission(request, None, self.activity))

    def test_creator_or_read_only_denies_write_to_non_creator(self):
        request = self.factory.patch('/')
        request.user = self.other
        self.assertFalse(IsCreatorOrReadOnly().has_object_permission(request, None, self.activity))

    def test_creator_or_read_only_allows_write_to_creator(self):
        request = self.factory.patch('/')
        request.user = self.creator
        self.assertTrue(IsCreatorOrReadOnly().has_object_permission(request, None, self.activity))

    def test_is_invitation_receiver_allows_only_to_user(self):
        request = self.factory.patch('/')
        request.user = self.other
        self.assertTrue(IsInvitationReceiver().has_object_permission(request, None, self.invitation))

        request.user = self.creator
        self.assertFalse(IsInvitationReceiver().has_object_permission(request, None, self.invitation))
