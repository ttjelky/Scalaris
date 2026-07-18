"""
Спільні фікстури для тестів apps.activities.

CHANNEL_LAYERS підмінено на InMemoryChannelLayer для всього модуля:
views/models намагаються сповіщати учасників через api.consumers.notify_*,
і хоч ці виклики обгорнуті в `except Exception: pass`, підміна прибирає
залежність тестів від живого Redis і небажані мережеві таймаути.

Потребує робочої PostGIS-бази (як і весь проєкт) — geo-фільтри
(point__distance_lte, Distance()) виконуються реальною БД, тому SQLite
тут не підійде.
"""
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

User = get_user_model()

TEST_CHANNEL_LAYERS = {
    'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'},
}

# Kyiv coordinates, used as a stable "home" point for most tests.
KYIV_LAT, KYIV_LNG = 50.4501, 30.5234


def make_point(lat, lng):
    return Point(lng, lat, srid=4326)


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class BaseActivityTestCase(APITestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.client = APIClient()

    def create_user(self, username, email=None, password='TestPass123!'):
        return User.objects.create_user(
            username=username, email=email or f'{username}@example.com', password=password,
        )

    def login(self, username, password='TestPass123!'):
        response = self.client.post('/api/users/login/', {'username': username, 'password': password})
        self.assertEqual(response.status_code, 200, response.data)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.data["access"]}')
        return response
