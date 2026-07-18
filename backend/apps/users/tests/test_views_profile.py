"""Тести профілю: /me/ (перегляд, редагування) та перегляд чужого профілю."""
from rest_framework.test import APIClient

from .base import BaseAPITestCase


class MeViewTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.user = self.create_user(username='alice', email='alice@example.com')
        self.login('alice')

    def test_get_me_requires_auth(self):
        anon = APIClient()
        response = anon.get('/api/users/me/')
        self.assertEqual(response.status_code, 401)

    def test_get_me_returns_own_profile(self):
        response = self.client.get('/api/users/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'alice')

    def test_update_bio_and_visibility(self):
        response = self.client.patch('/api/users/me/', {
            'bio': 'Hello world', 'is_visible_on_map': False,
        })
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.bio, 'Hello world')
        self.assertFalse(self.user.is_visible_on_map)

    def test_discord_username_is_read_only(self):
        response = self.client.patch('/api/users/me/', {'discord_username': 'hacked'})
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertNotEqual(self.user.discord_username, 'hacked')

    def test_update_phone_number(self):
        response = self.client.patch('/api/users/me/', {'phone': '+380501234567'})
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.phone, '+380501234567')

    def test_phone_included_in_me_response(self):
        self.user.phone = '+380501234567'
        self.user.save(update_fields=['phone'])
        response = self.client.get('/api/users/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['phone'], '+380501234567')

    def test_phone_defaults_to_empty_string(self):
        response = self.client.get('/api/users/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['phone'], '')


class UserDetailViewTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user(username='alice', email='alice@example.com')
        self.bob = self.create_user(username='bob', email='bob@example.com')
        self.login('alice')

    def test_get_other_user_profile(self):
        response = self.client.get(f'/api/users/{self.bob.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'bob')
        self.assertIn('friendship_status', response.data)

    def test_requires_authentication(self):
        anon = APIClient()
        response = anon.get(f'/api/users/{self.bob.pk}/')
        self.assertEqual(response.status_code, 401)

    def test_nonexistent_user_returns_404(self):
        response = self.client.get('/api/users/999999/')
        self.assertEqual(response.status_code, 404)


class MeViewAvatarTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.user = self.create_user(username='alice', email='alice@example.com')
        self.login('alice')

    def test_get_me_returns_all_expected_fields(self):
        response = self.client.get('/api/users/me/')
        self.assertEqual(response.status_code, 200)
        for field in ['id', 'username', 'email', 'avatar', 'bio', 'phone',
                       'is_visible_on_map', 'discord_username']:
            self.assertIn(field, response.data)

    def test_email_is_in_me_response(self):
        response = self.client.get('/api/users/me/')
        self.assertEqual(response.data['email'], 'alice@example.com')
