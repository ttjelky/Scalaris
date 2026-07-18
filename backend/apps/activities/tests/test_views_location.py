"""Тести LocationViewSet: create/update/nearby, включно з блокуванням і видимістю."""
from apps.users.models import Block

from ..models import Location
from .base import BaseActivityTestCase, KYIV_LAT, KYIV_LNG, make_point


class LocationViewSetTests(BaseActivityTestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user('alice')
        self.bob = self.create_user('bob')
        self.login('alice')

    def test_create_upserts_location(self):
        response = self.client.post('/api/activities/locations/', {
            'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Location.objects.filter(user=self.alice).count(), 1)

        # Другий POST оновлює той самий запис, а не створює новий.
        response = self.client.post('/api/activities/locations/', {
            'latitude': KYIV_LAT + 0.01, 'longitude': KYIV_LNG,
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Location.objects.filter(user=self.alice).count(), 1)

    def test_update_via_put(self):
        Location.objects.create(user=self.alice, point=make_point(KYIV_LAT, KYIV_LNG))
        response = self.client.put('/api/activities/locations/1/', {
            'latitude': KYIV_LAT + 0.02, 'longitude': KYIV_LNG,
        })
        self.assertEqual(response.status_code, 200)
        location = Location.objects.get(user=self.alice)
        self.assertAlmostEqual(location.point.y, KYIV_LAT + 0.02, places=4)

    def test_nearby_excludes_self(self):
        Location.objects.create(user=self.alice, point=make_point(KYIV_LAT, KYIV_LNG))
        response = self.client.get('/api/activities/locations/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_nearby_returns_visible_users_within_radius(self):
        Location.objects.create(user=self.bob, point=make_point(KYIV_LAT + 0.001, KYIV_LNG))
        response = self.client.get('/api/activities/locations/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        self.assertEqual(response.status_code, 200)
        usernames = [u['username'] for u in response.data]
        self.assertIn('bob', usernames)

    def test_nearby_excludes_invisible_users(self):
        self.bob.is_visible_on_map = False
        self.bob.save()
        Location.objects.create(user=self.bob, point=make_point(KYIV_LAT + 0.001, KYIV_LNG))
        response = self.client.get('/api/activities/locations/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        usernames = [u['username'] for u in response.data]
        self.assertNotIn('bob', usernames)

    def test_nearby_excludes_mutually_blocked_users(self):
        Location.objects.create(user=self.bob, point=make_point(KYIV_LAT + 0.001, KYIV_LNG))
        Block.objects.create(blocker=self.alice, blocked=self.bob)
        response = self.client.get('/api/activities/locations/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        usernames = [u['username'] for u in response.data]
        self.assertNotIn('bob', usernames)

    def test_nearby_excludes_users_outside_radius(self):
        # ~1.1 degrees of latitude is roughly 120km away — well outside a 5km radius.
        Location.objects.create(user=self.bob, point=make_point(KYIV_LAT + 1.1, KYIV_LNG))
        response = self.client.get('/api/activities/locations/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        usernames = [u['username'] for u in response.data]
        self.assertNotIn('bob', usernames)

    def test_nearby_missing_params_returns_400(self):
        response = self.client.get('/api/activities/locations/nearby/')
        self.assertEqual(response.status_code, 400)
