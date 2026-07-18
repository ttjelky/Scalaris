"""Тести Discord OAuth (auth / link / unlink) — зовнішні виклики замоковані."""
from unittest.mock import patch

from django.contrib.auth import get_user_model

from .base import BaseAPITestCase

User = get_user_model()

DISCORD_SETTINGS = dict(
    DISCORD_CLIENT_ID='client-id',
    DISCORD_CLIENT_SECRET='client-secret',
    DISCORD_REDIRECT_URI='https://localhost:5174/oauth/discord/callback',
)


class DiscordAuthViewTests(BaseAPITestCase):
    def test_missing_code_returns_400(self):
        response = self.client.post('/api/users/auth/discord/', {})
        self.assertEqual(response.status_code, 400)

    def test_not_configured_returns_503(self):
        with self.settings(DISCORD_CLIENT_ID='', DISCORD_CLIENT_SECRET=''):
            response = self.client.post('/api/users/auth/discord/', {
                'code': 'abc', 'redirect_uri': 'https://localhost:5174/oauth/discord/callback',
            })
        self.assertEqual(response.status_code, 503)

    def test_invalid_redirect_uri_rejected(self):
        with self.settings(**DISCORD_SETTINGS):
            response = self.client.post('/api/users/auth/discord/', {
                'code': 'abc', 'redirect_uri': 'https://evil.example.com/callback',
            })
        self.assertEqual(response.status_code, 400)

    @patch('apps.users.views.DiscordOAuthMixin._fetch_profile')
    @patch('apps.users.views.DiscordOAuthMixin._exchange_code')
    def test_new_discord_user_is_created(self, mock_exchange, mock_profile):
        mock_exchange.return_value = {'access_token': 'tok'}
        mock_profile.return_value = {'id': '111222333', 'username': 'discorduser', 'email': ''}

        with self.settings(**DISCORD_SETTINGS):
            response = self.client.post('/api/users/auth/discord/', {
                'code': 'abc', 'redirect_uri': DISCORD_SETTINGS['DISCORD_REDIRECT_URI'],
            })
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        user = User.objects.get(discord_id='111222333')
        self.assertEqual(user.username, 'discorduser')
        self.assertFalse(user.has_usable_password())

    @patch('apps.users.views.DiscordOAuthMixin._fetch_profile')
    @patch('apps.users.views.DiscordOAuthMixin._exchange_code')
    def test_existing_linked_user_logs_in(self, mock_exchange, mock_profile):
        existing = self.create_user(username='already', email='already@example.com')
        existing.discord_id = '999'
        existing.save(update_fields=['discord_id'])

        mock_exchange.return_value = {'access_token': 'tok'}
        mock_profile.return_value = {'id': '999', 'username': 'already', 'email': ''}

        with self.settings(**DISCORD_SETTINGS):
            response = self.client.post('/api/users/auth/discord/', {
                'code': 'abc', 'redirect_uri': DISCORD_SETTINGS['DISCORD_REDIRECT_URI'],
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.filter(discord_id='999').count(), 1)

    @patch('apps.users.views.DiscordOAuthMixin._fetch_profile')
    @patch('apps.users.views.DiscordOAuthMixin._exchange_code')
    def test_email_collision_without_link_is_refused_not_auto_linked(self, mock_exchange, mock_profile):
        """Не можна тихцем підхопити існуючий пароль-акаунт лише за збігом email."""
        self.create_user(username='passworduser', email='shared@example.com')

        mock_exchange.return_value = {'access_token': 'tok'}
        mock_profile.return_value = {'id': '555', 'username': 'discordname', 'email': 'shared@example.com'}

        with self.settings(**DISCORD_SETTINGS):
            response = self.client.post('/api/users/auth/discord/', {
                'code': 'abc', 'redirect_uri': DISCORD_SETTINGS['DISCORD_REDIRECT_URI'],
            })
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(discord_id='555').exists())


class DiscordAuthUsernameCollisionTests(BaseAPITestCase):
    @patch('apps.users.views.DiscordOAuthMixin._fetch_profile')
    @patch('apps.users.views.DiscordOAuthMixin._exchange_code')
    def test_username_collision_appends_suffix(self, mock_exchange, mock_profile):
        self.create_user(username='discorduser')
        mock_exchange.return_value = {'access_token': 'tok'}
        mock_profile.return_value = {'id': '888', 'username': 'discorduser', 'email': ''}

        with self.settings(**DISCORD_SETTINGS):
            response = self.client.post('/api/users/auth/discord/', {
                'code': 'abc', 'redirect_uri': DISCORD_SETTINGS['DISCORD_REDIRECT_URI'],
            })
        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.filter(discord_id='888').exists())
        user = User.objects.get(discord_id='888')
        self.assertNotEqual(user.username, 'discorduser')
        self.assertTrue(user.username.startswith('discorduser'))


class DiscordLinkUnlinkTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.user = self.create_user(username='alice', email='alice@example.com')
        self.login('alice')

    @patch('apps.users.views.DiscordOAuthMixin._fetch_profile')
    @patch('apps.users.views.DiscordOAuthMixin._exchange_code')
    def test_link_success(self, mock_exchange, mock_profile):
        mock_exchange.return_value = {'access_token': 'tok'}
        mock_profile.return_value = {'id': '777', 'username': 'alice_discord', 'email': ''}

        with self.settings(**DISCORD_SETTINGS):
            response = self.client.post('/api/users/oauth/discord/link/', {
                'code': 'abc', 'redirect_uri': DISCORD_SETTINGS['DISCORD_REDIRECT_URI'],
            })
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.discord_id, '777')

    @patch('apps.users.views.DiscordOAuthMixin._fetch_profile')
    @patch('apps.users.views.DiscordOAuthMixin._exchange_code')
    def test_link_conflict_when_discord_account_used_elsewhere(self, mock_exchange, mock_profile):
        other = self.create_user(username='bob', email='bob@example.com')
        other.discord_id = '777'
        other.save(update_fields=['discord_id'])

        mock_exchange.return_value = {'access_token': 'tok'}
        mock_profile.return_value = {'id': '777', 'username': 'bob_discord', 'email': ''}

        with self.settings(**DISCORD_SETTINGS):
            response = self.client.post('/api/users/oauth/discord/link/', {
                'code': 'abc', 'redirect_uri': DISCORD_SETTINGS['DISCORD_REDIRECT_URI'],
            })
        self.assertEqual(response.status_code, 409)

    def test_unlink_without_discord_linked_returns_400(self):
        response = self.client.delete('/api/users/oauth/discord/unlink/')
        self.assertEqual(response.status_code, 400)

    def test_unlink_without_usable_password_is_refused(self):
        self.user.discord_id = '777'
        self.user.set_unusable_password()
        self.user.save()
        response = self.client.delete('/api/users/oauth/discord/unlink/')
        self.assertEqual(response.status_code, 400)

    def test_unlink_success_when_password_is_set(self):
        self.user.discord_id = '777'
        self.user.save(update_fields=['discord_id'])
        response = self.client.delete('/api/users/oauth/discord/unlink/')
        self.assertEqual(response.status_code, 204)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.discord_id)


class DiscordLinkMissingCodeTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.user = self.create_user(username='alice', email='alice@example.com')
        self.login('alice')

    def test_link_missing_code_returns_400(self):
        response = self.client.post('/api/users/oauth/discord/link/', {})
        self.assertEqual(response.status_code, 400)
