"""
Повний набір тестів для apps.users.

Покриває:
- моделі (User, Block, Report, FriendRequest)
- серіалізатори (Register, PasswordReset*, UserPublic)
- реєстрацію / логін (username і email) / refresh / logout
- скидання паролю (включно з анти-enumeration та one-time-use токеном)
- блокування / скарги
- систему друзів (запити, авто-прийняття, блокування, видалення)
- сповіщення (список + лічильник)
- Discord OAuth (auth / link / unlink) — зовнішні виклики замоковані

Запуск:
    python manage.py test apps.users

Примітка: throttle-класи (AnonRateThrottle) використовують Django-кеш
(за замовчуванням locmem), який НЕ очищується автоматично між тестами.
Тому базовий клас нижче чистить кеш у setUp — без цього тести, що логіняться
багато разів (10+ на модуль), можуть впасти з 429 Too Many Requests.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory, APITestCase

from .models import Block, FriendRequest, Report
from .serializers import (
    PasswordResetConfirmSerializer,
    RegisterSerializer,
    UserPublicSerializer,
)
from .views import LogoutView, PasswordResetToken, _password_fingerprint

User = get_user_model()

KYIV_LAT, KYIV_LNG = 50.4501, 30.5234


def make_point(lat, lng):
    return Point(lng, lat, srid=4326)


class BaseAPITestCase(APITestCase):
    """Спільний setUp: чистий throttle-кеш перед кожним тестом."""

    def setUp(self):
        super().setUp()
        cache.clear()
        self.client = APIClient()

    def create_user(self, username='user', email=None, password='TestPass123!'):
        return User.objects.create_user(
            username=username,
            email=email or f'{username}@example.com',
            password=password,
        )

    def login(self, username, password='TestPass123!'):
        response = self.client.post('/api/users/login/', {
            'username': username,
            'password': password,
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.data["access"]}')
        return response


# ==========================================
#                МОДЕЛІ
# ==========================================

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


# ==========================================
#              СЕРІАЛІЗАТОРИ
# ==========================================

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


# ==========================================
#        РЕЄСТРАЦІЯ / ЛОГІН / ТОКЕНИ
# ==========================================

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


# ==========================================
#           СКИДАННЯ ПАРОЛЮ
# ==========================================

class PasswordResetTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.user = self.create_user(username='alice', email='alice@example.com', password='OldPass123!')
        self.patcher = patch('apps.users.views.send_mail')
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

        # Той самий (все ще підписаний правильно і не протух за часом) токен
        # більше не спрацює, бо пароль вже змінився -> fingerprint не збігається.
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


# ==========================================
#                  ME / ПРОФІЛЬ
# ==========================================

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


# ==========================================
#           БЛОКУВАННЯ / СКАРГИ
# ==========================================

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


# ==========================================
#             СИСТЕМА ДРУЗІВ
# ==========================================

class FriendSystemTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user(username='alice', email='alice@example.com')
        self.bob = self.create_user(username='bob', email='bob@example.com')
        self.login('alice')

    def _login_as(self, username):
        self.client.credentials()
        self.login(username)

    def test_send_and_accept_friend_request(self):
        response = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['friendship_status'], 'request_sent')

        self._login_as('bob')

        profile = self.client.get(f'/api/users/{self.alice.pk}/')
        self.assertEqual(profile.data['friendship_status'], 'request_received')
        request_id = profile.data['friend_request_id']

        response = self.client.post(f'/api/users/friend-requests/{request_id}/accept/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.alice.friends.filter(pk=self.bob.pk).exists())

        friends = self.client.get('/api/users/me/friends/')
        self.assertEqual(friends.status_code, 200)
        usernames = [u['username'] for u in friends.data['results']]
        self.assertIn('alice', usernames)

    def test_auto_accept_when_both_users_send_requests(self):
        FriendRequest.objects.create(from_user=self.bob, to_user=self.alice)
        response = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['friendship_status'], 'friends')
        self.assertTrue(self.alice.friends.filter(pk=self.bob.pk).exists())
        # Обидва зустрічні запити мають бути прибрані.
        self.assertEqual(FriendRequest.objects.count(), 0)

    def test_cannot_send_request_to_self(self):
        response = self.client.post(f'/api/users/{self.alice.pk}/friend-request/')
        self.assertEqual(response.status_code, 400)

    def test_cannot_send_request_if_already_friends(self):
        self.alice.friends.add(self.bob)
        response = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(response.status_code, 400)

    def test_cannot_send_request_to_user_who_blocked_me(self):
        Block.objects.create(blocker=self.bob, blocked=self.alice)
        response = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(response.status_code, 403)

    def test_cannot_send_request_to_user_i_blocked(self):
        Block.objects.create(blocker=self.alice, blocked=self.bob)
        response = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(response.status_code, 400)

    def test_sending_same_request_twice_returns_200_not_created(self):
        first = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(first.status_code, 201)
        second = self.client.post(f'/api/users/{self.bob.pk}/friend-request/')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(FriendRequest.objects.count(), 1)

    def test_reject_request_by_receiver(self):
        fr = FriendRequest.objects.create(from_user=self.alice, to_user=self.bob)
        self._login_as('bob')
        response = self.client.delete(f'/api/users/friend-requests/{fr.pk}/reject/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(FriendRequest.objects.filter(pk=fr.pk).exists())

    def test_cancel_request_by_sender(self):
        fr = FriendRequest.objects.create(from_user=self.alice, to_user=self.bob)
        response = self.client.delete(f'/api/users/friend-requests/{fr.pk}/reject/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(FriendRequest.objects.filter(pk=fr.pk).exists())

    def test_unrelated_user_cannot_reject_request(self):
        fr = FriendRequest.objects.create(from_user=self.alice, to_user=self.bob)
        charlie = self.create_user(username='charlie', email='charlie@example.com')
        self._login_as('charlie')
        response = self.client.delete(f'/api/users/friend-requests/{fr.pk}/reject/')
        self.assertEqual(response.status_code, 404)

    def test_remove_friend(self):
        self.alice.friends.add(self.bob)
        response = self.client.delete(f'/api/users/{self.bob.pk}/friend/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(self.alice.friends.filter(pk=self.bob.pk).exists())
        self.assertFalse(self.bob.friends.filter(pk=self.alice.pk).exists())

    def test_sent_and_received_lists(self):
        FriendRequest.objects.create(from_user=self.alice, to_user=self.bob)
        sent = self.client.get('/api/users/me/friend-requests/sent/')
        self.assertEqual(sent.status_code, 200)
        self.assertEqual(len(sent.data['results']), 1)

        self._login_as('bob')
        received = self.client.get('/api/users/me/friend-requests/received/')
        self.assertEqual(received.status_code, 200)
        self.assertEqual(len(received.data['results']), 1)


# ==========================================
#                СПОВІЩЕННЯ
# ==========================================

class NotificationsTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user(username='alice', email='alice@example.com')
        self.bob = self.create_user(username='bob', email='bob@example.com')
        self.login('alice')

    def test_count_reflects_pending_friend_requests(self):
        FriendRequest.objects.create(from_user=self.bob, to_user=self.alice)
        response = self.client.get('/api/users/me/notifications/count/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)

    def test_notifications_list_contains_friend_request_entry(self):
        FriendRequest.objects.create(from_user=self.bob, to_user=self.alice)
        response = self.client.get('/api/users/me/notifications/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['type'], 'friend_request')
        self.assertEqual(response.data[0]['from_user']['username'], 'bob')

    def test_notifications_count_zero_when_none(self):
        response = self.client.get('/api/users/me/notifications/count/')
        self.assertEqual(response.data['count'], 0)


# ==========================================
#              DISCORD OAUTH
# ==========================================

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


# ==========================================
#        ДОДАТКОВІ ТЕСТИ (прогалини)
# ==========================================

class FriendRequestStrTests(TestCase):
    def test_str_representation(self):
        alice = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        bob = User.objects.create_user(username='bob', email='b@example.com', password='pw')
        fr = FriendRequest.objects.create(from_user=alice, to_user=bob)
        self.assertEqual(str(fr), 'alice -> bob')


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


class DiscordLinkMissingCodeTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.user = self.create_user(username='alice', email='alice@example.com')
        self.login('alice')

    def test_link_missing_code_returns_400(self):
        response = self.client.post('/api/users/oauth/discord/link/', {})
        self.assertEqual(response.status_code, 400)


class NotificationsWithActivityInvitationTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user(username='alice', email='alice@example.com')
        self.bob = self.create_user(username='bob', email='bob@example.com')
        self.login('alice')

    def test_notifications_include_activity_invitation(self):
        from apps.activities.models import Activity, Invitation
        activity = Activity.objects.create(
            creator=self.bob, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        Invitation.objects.create(from_user=self.bob, to_user=self.alice, activity=activity)

        response = self.client.get('/api/users/me/notifications/')
        self.assertEqual(response.status_code, 200)
        types = [n['type'] for n in response.data]
        self.assertIn('activity_invitation', types)

    def test_notifications_count_includes_invitations(self):
        from apps.activities.models import Activity, Invitation
        activity = Activity.objects.create(
            creator=self.bob, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        Invitation.objects.create(from_user=self.bob, to_user=self.alice, activity=activity)

        response = self.client.get('/api/users/me/notifications/count/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)


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