"""Тести моделей: User, Block, Report, FriendRequest."""
from django.contrib.auth import get_user_model
from django.test import TestCase

from ..models import Block, FriendRequest, Report

User = get_user_model()


class UserModelTests(TestCase):
    def test_str_returns_username(self):
        user = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.assertEqual(str(user), 'alice')

    def test_friends_relation_is_symmetrical(self):
        alice = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        bob = User.objects.create_user(username='bob', email='b@example.com', password='pw')
        alice.friends.add(bob)
        self.assertTrue(alice.friends.filter(pk=bob.pk).exists())
        self.assertTrue(bob.friends.filter(pk=alice.pk).exists())

    def test_discord_id_unique_but_nullable(self):
        User.objects.create_user(username='a', email='a@example.com', password='pw')
        User.objects.create_user(username='b', email='b@example.com', password='pw')
        # Кілька юзерів можуть мати discord_id=None одночасно (null != null у БД).
        self.assertEqual(User.objects.filter(discord_id__isnull=True).count(), 2)


class BlockModelTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.bob = User.objects.create_user(username='bob', email='b@example.com', password='pw')

    def test_str_representation(self):
        block = Block.objects.create(blocker=self.alice, blocked=self.bob)
        self.assertIn('blocked', str(block))

    def test_unique_together_blocker_blocked(self):
        Block.objects.create(blocker=self.alice, blocked=self.bob)
        with self.assertRaises(Exception):
            Block.objects.create(blocker=self.alice, blocked=self.bob)


class ReportModelTests(TestCase):
    def test_str_representation(self):
        alice = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        bob = User.objects.create_user(username='bob', email='b@example.com', password='pw')
        report = Report.objects.create(reporter=alice, reported=bob, reason=Report.Reason.SPAM)
        self.assertIn('spam', str(report))


class FriendRequestModelTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.bob = User.objects.create_user(username='bob', email='b@example.com', password='pw')

    def test_clean_forbids_self_request(self):
        fr = FriendRequest(from_user=self.alice, to_user=self.alice)
        with self.assertRaises(Exception):
            fr.clean()

    def test_unique_together_from_to(self):
        FriendRequest.objects.create(from_user=self.alice, to_user=self.bob)
        with self.assertRaises(Exception):
            FriendRequest.objects.create(from_user=self.alice, to_user=self.bob)


class FriendRequestStrTests(TestCase):
    def test_str_representation(self):
        alice = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        bob = User.objects.create_user(username='bob', email='b@example.com', password='pw')
        fr = FriendRequest.objects.create(from_user=alice, to_user=bob)
        self.assertEqual(str(fr), 'alice -> bob')
