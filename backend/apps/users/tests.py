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


class FriendSystemTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='alice',
            email='alice@example.com',
            password='TestPass123!',
        )
        self.other = User.objects.create_user(
            username='bob',
            email='bob@example.com',
            password='TestPass123!',
        )
        login = self.client.post('/api/users/login/', {
            'username': 'alice',
            'password': 'TestPass123!',
        })
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')

    def test_send_and_accept_friend_request(self):
        response = self.client.post(f'/api/users/{self.other.pk}/friend-request/')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['friendship_status'], 'request_sent')

        self.client.credentials()  # clear auth
        login = self.client.post('/api/users/login/', {
            'username': 'bob',
            'password': 'TestPass123!',
        })
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')

        profile = self.client.get(f'/api/users/{self.user.pk}/')
        self.assertEqual(profile.data['friendship_status'], 'request_received')
        request_id = profile.data['friend_request_id']

        response = self.client.post(f'/api/users/friend-requests/{request_id}/accept/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.user.friends.filter(pk=self.other.pk).exists())

        friends = self.client.get('/api/users/me/friends/')
        self.assertEqual(friends.status_code, 200)
        usernames = [u['username'] for u in friends.data['results']]
        self.assertIn('alice', usernames)

    def test_auto_accept_when_both_users_send_requests(self):
        from .models import FriendRequest

        FriendRequest.objects.create(from_user=self.other, to_user=self.user)
        response = self.client.post(f'/api/users/{self.other.pk}/friend-request/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['friendship_status'], 'friends')
        self.assertTrue(self.user.friends.filter(pk=self.other.pk).exists())
