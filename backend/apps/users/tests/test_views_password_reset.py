"""Тести скидання паролю (включно з анти-enumeration та one-time-use токеном)."""
from unittest.mock import patch

from django.contrib.auth import get_user_model

from ..views import PasswordResetToken, _password_fingerprint
from .base import BaseAPITestCase

User = get_user_model()


class PasswordResetTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.user = self.create_user(username='alice', email='alice@example.com', password='OldPass123!')
        self.patcher = patch('apps.users.views.password_reset.send_mail')
        self.mock_send_mail = self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def _make_reset_token(self, user=None):
        u = user or self.user
        token = PasswordResetToken.for_user(u)
        token['email'] = str(u.email)
        token['pwd_fp'] = _password_fingerprint(u)
        return str(token)

    def test_reset_request_for_existing_email_sends_mail_and_returns_200(self):
        response = self.client.post('/api/users/password-reset/', {'email': 'alice@example.com'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.filter(email='alice@example.com').exists())
        self.mock_send_mail.assert_called_once()

    def test_reset_request_for_unknown_email_returns_same_200_without_token_leak(self):
        """Анти-enumeration: невідома пошта -> той самий 200, і жодного 'token' у DEBUG,
        бо лист ніколи не надсилався і токен не генерувався."""
        response = self.client.post('/api/users/password-reset/', {'email': 'nobody@example.com'})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('token', response.data)

    def test_full_reset_flow_then_login_with_new_password(self):
        token = self._make_reset_token()

        new_password = 'NewPass123!'
        response = self.client.post('/api/users/password-reset-confirm/', {
            'token': token, 'password': new_password, 'password_confirm': new_password,
        })
        self.assertEqual(response.status_code, 200)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(new_password))

        response = self.client.post('/api/users/login/', {
            'username': 'alice', 'password': new_password,
        })
        self.assertEqual(response.status_code, 200)

    def test_reset_token_is_single_use(self):
        token = self._make_reset_token()

        first = self.client.post('/api/users/password-reset-confirm/', {
            'token': token, 'password': 'FirstNew123!', 'password_confirm': 'FirstNew123!',
        })
        self.assertEqual(first.status_code, 200)

        second = self.client.post('/api/users/password-reset-confirm/', {
            'token': token, 'password': 'SecondNew123!', 'password_confirm': 'SecondNew123!',
        })
        self.assertEqual(second.status_code, 400)

    def test_invalid_reset_token_rejected(self):
        response = self.client.post('/api/users/password-reset-confirm/', {
            'token': 'invalid.token.here', 'password': 'NewPass123!', 'password_confirm': 'NewPass123!',
        })
        self.assertEqual(response.status_code, 400)

    def test_password_mismatch_on_confirm_rejected(self):
        token = self._make_reset_token()
        response = self.client.post('/api/users/password-reset-confirm/', {
            'token': token, 'password': 'NewPass123!', 'password_confirm': 'Different123!',
        })
        self.assertEqual(response.status_code, 400)

    def test_password_fingerprint_changes_after_password_change(self):
        fp_before = _password_fingerprint(self.user)
        self.user.set_password('AnotherPass123!')
        self.user.save()
        fp_after = _password_fingerprint(self.user)
        self.assertNotEqual(fp_before, fp_after)


class PasswordResetConfirmUserNotFoundTests(BaseAPITestCase):
    def test_valid_token_but_user_deleted_returns_404(self):
        user = self.create_user(username='ghost', email='ghost@example.com')
        token = PasswordResetToken.for_user(user)
        token['email'] = str(user.email)
        token['pwd_fp'] = _password_fingerprint(user)
        user.delete()
        response = self.client.post('/api/users/password-reset-confirm/', {
            'token': str(token), 'password': 'NewPass123!', 'password_confirm': 'NewPass123!',
        })
        self.assertEqual(response.status_code, 404)
