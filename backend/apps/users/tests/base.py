"""
Спільні фікстури для тестів apps.users.

Примітка: throttle-класи (AnonRateThrottle) використовують Django-кеш
(за замовчуванням locmem), який НЕ очищується автоматично між тестами.
Тому базовий клас нижче чистить кеш у setUp — без цього тести, що логіняться
багато разів (10+ на модуль), можуть впасти з 429 Too Many Requests.
"""
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.core.cache import cache
from rest_framework.test import APIClient, APITestCase

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
