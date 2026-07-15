from django.test import TestCase, Client
from rest_framework.test import APIRequestFactory, APIClient
from django.contrib.auth import get_user_model

from .views import LogoutView, PasswordResetToken

User = get_user_model()


class LogoutViewTests(TestCase):
    def test_logout_clears_cookie_for_anonymous_request(self):
        factory = APIRequestFactory()
        request = factory.post('/api/users/logout/')

        response = LogoutView.as_view()(request)

        self.assertEqual(response.status_code, 205)
        self.assertIn('refresh_token', response.cookies)
        self.assertEqual(response.cookies['refresh_token']['max-age'], 0)


class AuthIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'TestPass123!',
            'password_confirm': 'TestPass123!',
        }

    def test_user_registration(self):
        """Test that a user can register."""
        response = self.client.post('/api/users/register/', self.user_data)
        self.assertEqual(response.status_code, 201)
        self.assertIn('id', response.data)
        self.assertTrue(User.objects.filter(username='testuser').exists())

    def test_user_login_and_get_me(self):
        """Test login and fetching user profile."""
        # Register
        User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='TestPass123!',
        )

        # Login
        response = self.client.post('/api/users/login/', {
            'username': 'testuser',
            'password': 'TestPass123!',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        access_token = response.data['access']

        # Fetch /me with token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        response = self.client.get('/api/users/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'testuser')

    def test_password_reset_flow(self):
        """Test password reset request and confirmation."""
        # Create user
        user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='OldPass123!',
        )

        # Request password reset
        response = self.client.post('/api/users/password-reset/', {
            'email': 'test@example.com',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)
        reset_token = response.data['token']

        # Confirm password reset
        new_password = 'NewPass123!'
        response = self.client.post('/api/users/password-reset-confirm/', {
            'token': reset_token,
            'password': new_password,
            'password_confirm': new_password,
        })
        self.assertEqual(response.status_code, 200)

        # Verify new password works
        user.refresh_from_db()
        self.assertTrue(user.check_password(new_password))

        # Login with new password
        response = self.client.post('/api/users/login/', {
            'username': 'testuser',
            'password': new_password,
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)

    def test_invalid_reset_token(self):
        """Test that invalid reset tokens are rejected."""
        response = self.client.post('/api/users/password-reset-confirm/', {
            'token': 'invalid.token.here',
            'password': 'NewPass123!',
            'password_confirm': 'NewPass123!',
        })
        self.assertEqual(response.status_code, 400)
