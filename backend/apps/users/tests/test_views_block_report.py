"""Тести блокування користувачів та скарг на них."""
from ..models import Block, Report
from .base import BaseAPITestCase


class BlockViewTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user(username='alice', email='alice@example.com')
        self.bob = self.create_user(username='bob', email='bob@example.com')
        self.login('alice')

    def test_block_user(self):
        response = self.client.post(f'/api/users/{self.bob.pk}/block/')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Block.objects.filter(blocker=self.alice, blocked=self.bob).exists())

    def test_cannot_block_self(self):
        response = self.client.post(f'/api/users/{self.alice.pk}/block/')
        self.assertEqual(response.status_code, 400)

    def test_blocking_twice_is_idempotent_200(self):
        self.client.post(f'/api/users/{self.bob.pk}/block/')
        response = self.client.post(f'/api/users/{self.bob.pk}/block/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Block.objects.filter(blocker=self.alice, blocked=self.bob).count(), 1)

    def test_unblock_user(self):
        Block.objects.create(blocker=self.alice, blocked=self.bob)
        response = self.client.delete(f'/api/users/{self.bob.pk}/block/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Block.objects.filter(blocker=self.alice, blocked=self.bob).exists())

    def test_unblock_not_blocked_returns_404(self):
        response = self.client.delete(f'/api/users/{self.bob.pk}/block/')
        self.assertEqual(response.status_code, 404)

    def test_cannot_unblock_self(self):
        response = self.client.delete(f'/api/users/{self.alice.pk}/block/')
        self.assertEqual(response.status_code, 400)

    def test_blocked_users_list(self):
        Block.objects.create(blocker=self.alice, blocked=self.bob)
        response = self.client.get('/api/users/blocked/')
        self.assertEqual(response.status_code, 200)
        usernames = [u['username'] for u in response.data['results']]
        self.assertIn('bob', usernames)


class ReportUserViewTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user(username='alice', email='alice@example.com')
        self.bob = self.create_user(username='bob', email='bob@example.com')
        self.login('alice')

    def test_report_user_success(self):
        response = self.client.post(f'/api/users/{self.bob.pk}/report/', {
            'reason': Report.Reason.SPAM, 'details': 'Spamming me',
        })
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Report.objects.filter(reporter=self.alice, reported=self.bob).exists())

    def test_cannot_report_self(self):
        response = self.client.post(f'/api/users/{self.alice.pk}/report/', {
            'reason': Report.Reason.SPAM,
        })
        self.assertEqual(response.status_code, 400)

    def test_invalid_reason_rejected(self):
        response = self.client.post(f'/api/users/{self.bob.pk}/report/', {
            'reason': 'not_a_real_reason',
        })
        self.assertEqual(response.status_code, 400)
