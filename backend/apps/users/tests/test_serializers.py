"""Тести серіалізаторів: Register, PasswordResetConfirm, UserPublic."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from ..models import Block, FriendRequest
from ..serializers import (
    PasswordResetConfirmSerializer,
    RegisterSerializer,
    UserPublicSerializer,
)

User = get_user_model()


class RegisterSerializerTests(TestCase):
    def test_password_mismatch_is_rejected(self):
        serializer = RegisterSerializer(data={
            'username': 'newuser',
            'email': 'new@example.com',
            'password': 'StrongPass123!',
            'password_confirm': 'Different123!',
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('password_confirm', serializer.errors)

    def test_duplicate_email_case_insensitive_is_rejected(self):
        User.objects.create_user(username='existing', email='dup@example.com', password='pw')
        serializer = RegisterSerializer(data={
            'username': 'newuser',
            'email': 'DUP@example.com',
            'password': 'StrongPass123!',
            'password_confirm': 'StrongPass123!',
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('email', serializer.errors)

    def test_weak_password_is_rejected_by_django_validators(self):
        serializer = RegisterSerializer(data={
            'username': 'newuser',
            'email': 'new@example.com',
            'password': '123',
            'password_confirm': '123',
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('password', serializer.errors)

    def test_valid_data_creates_user_with_hashed_password(self):
        serializer = RegisterSerializer(data={
            'username': 'newuser',
            'email': 'new@example.com',
            'password': 'StrongPass123!',
            'password_confirm': 'StrongPass123!',
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()
        self.assertNotEqual(user.password, 'StrongPass123!')
        self.assertTrue(user.check_password('StrongPass123!'))


class PasswordResetConfirmSerializerTests(TestCase):
    def test_password_mismatch_is_rejected(self):
        serializer = PasswordResetConfirmSerializer(data={
            'token': 'whatever',
            'password': 'NewPass123!',
            'password_confirm': 'Mismatch123!',
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('password_confirm', serializer.errors)


class UserPublicSerializerTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.alice = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.bob = User.objects.create_user(username='bob', email='b@example.com', password='pw')

    def _serialize(self, obj, viewer):
        request = self.factory.get('/')
        request.user = viewer
        return UserPublicSerializer(obj, context={'request': request}).data

    def test_friendship_status_none_by_default(self):
        data = self._serialize(self.bob, self.alice)
        self.assertEqual(data['friendship_status'], 'none')
        self.assertIsNone(data['friend_request_id'])

    def test_friendship_status_request_sent(self):
        FriendRequest.objects.create(from_user=self.alice, to_user=self.bob)
        data = self._serialize(self.bob, self.alice)
        self.assertEqual(data['friendship_status'], 'request_sent')
        self.assertIsNotNone(data['friend_request_id'])

    def test_friendship_status_request_received(self):
        FriendRequest.objects.create(from_user=self.bob, to_user=self.alice)
        data = self._serialize(self.bob, self.alice)
        self.assertEqual(data['friendship_status'], 'request_received')

    def test_friendship_status_friends(self):
        self.alice.friends.add(self.bob)
        data = self._serialize(self.bob, self.alice)
        self.assertEqual(data['friendship_status'], 'friends')

    def test_is_blocked_reflects_block_state(self):
        Block.objects.create(blocker=self.alice, blocked=self.bob)
        data = self._serialize(self.bob, self.alice)
        self.assertTrue(data['is_blocked'])
