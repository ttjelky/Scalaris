"""Тести реєстрації / логіну (username і email) / refresh / logout."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient, APIRequestFactory

from ..views import LogoutView
from .base import BaseAPITestCase

User = get_user_model()


class RegisterViewTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.payload = {
            'username': 'newuser',
            'email': 'new@example.com',
            'password': 'StrongPass123!',
            'password_confirm': 'StrongPass123!',
        }

    def test_register_success(self):
        response = self.client.post('/api/users/register/', self.payload)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(username='newuser').exists())
        # Пароль ніколи не повертається в response.
        self.assertNotIn('password', response.data)

    def test_register_duplicate_username_rejected(self):
        self.create_user(username='newuser')
        response = self.client.post('/api/users/register/', self.payload)
        self.assertEqual(response.status_code, 400)

    def test_register_password_mismatch_rejected(self):
        payload = {**self.payload, 'password_confirm': 'Other123!'}
        response = self.client.post('/api/users/register/', payload)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username='newuser').exists())


class LoginTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.user = self.create_user(username='alice', email='alice@example.com')

    def test_login_with_username(self):
        response = self.client.post('/api/users/login/', {
            'username': 'alice', 'password': 'TestPass123!',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)

    def test_login_with_email_in_username_field(self):
        response = self.client.post('/api/users/login/', {
            'username': 'alice@example.com', 'password': 'TestPass123!',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)

    def test_login_wrong_password_rejected(self):
        response = self.client.post('/api/users/login/', {
            'username': 'alice', 'password': 'WrongPass!',
        })
        self.assertEqual(response.status_code, 401)

    def test_refresh_token_never_in_response_body_but_in_cookie(self):
        response = self.client.post('/api/users/login/', {
            'username': 'alice', 'password': 'TestPass123!',
        })
        self.assertNotIn('refresh', response.data)
        self.assertIn('refresh_token', response.cookies)
        cookie = response.cookies['refresh_token']
        self.assertTrue(cookie['httponly'])

    def test_stale_authorization_header_does_not_block_login(self):
        """EmailTokenObtainPairView вимикає authentication_classes навмисно:
        протухлий/невалідний Bearer-токен у заголовку не повинен заважати логіну."""
        self.client.credentials(HTTP_AUTHORIZATION='Bearer this.is.garbage')
        response = self.client.post('/api/users/login/', {
            'username': 'alice', 'password': 'TestPass123!',
        })
        self.assertEqual(response.status_code, 200)


class TokenRefreshTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.user = self.create_user(username='alice', email='alice@example.com')
        self.login_response = self.client.post('/api/users/login/', {
            'username': 'alice', 'password': 'TestPass123!',
        })

    def test_refresh_without_cookie_returns_401(self):
        self.client.cookies.clear()
        response = self.client.post('/api/users/login/refresh/')
        self.assertEqual(response.status_code, 401)

    def test_refresh_with_valid_cookie_rotates_token(self):
        refresh_cookie = self.login_response.cookies['refresh_token'].value
        self.client.cookies['refresh_token'] = refresh_cookie
        response = self.client.post('/api/users/login/refresh/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        # ROTATE_REFRESH_TOKENS=True -> нова кука відрізняється від старої.
        self.assertIn('refresh_token', response.cookies)
        self.assertNotEqual(response.cookies['refresh_token'].value, refresh_cookie)

    def test_refresh_with_invalid_cookie_returns_401_and_clears_cookie(self):
        self.client.cookies['refresh_token'] = 'not-a-real-token'
        response = self.client.post('/api/users/login/refresh/')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.cookies['refresh_token']['max-age'], 0)


class LogoutViewTests(TestCase):
    def test_logout_clears_cookie_for_anonymous_request(self):
        factory = APIRequestFactory()
        request = factory.post('/api/users/logout/')
        response = LogoutView.as_view()(request)
        self.assertEqual(response.status_code, 205)
        self.assertIn('refresh_token', response.cookies)
        self.assertEqual(response.cookies['refresh_token']['max-age'], 0)

    def test_logout_blacklists_real_refresh_token(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

        user = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        refresh = RefreshToken.for_user(user)

        client = APIClient()
        client.cookies['refresh_token'] = str(refresh)
        response = client.post('/api/users/logout/')

        self.assertEqual(response.status_code, 205)
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=refresh['jti']).exists()
        )

    def test_logout_with_already_invalid_cookie_still_succeeds(self):
        client = APIClient()
        client.cookies['refresh_token'] = 'garbage-token'
        response = client.post('/api/users/logout/')
        self.assertEqual(response.status_code, 205)
