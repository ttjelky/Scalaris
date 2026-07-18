"""Тести ендпоінта online-count."""
from datetime import timedelta

from django.utils import timezone

from ..models import Location
from .base import BaseActivityTestCase, KYIV_LAT, KYIV_LNG, make_point


class OnlineCountTests(BaseActivityTestCase):
    def test_counts_only_recently_updated_locations(self):
        alice = self.create_user('alice')
        bob = self.create_user('bob')
        Location.objects.create(user=alice, point=make_point(KYIV_LAT, KYIV_LNG))
        stale = Location.objects.create(user=bob, point=make_point(KYIV_LAT, KYIV_LNG))
        Location.objects.filter(pk=stale.pk).update(updated_at=timezone.now() - timedelta(minutes=30))

        self.login('alice')
        response = self.client.get('/api/activities/online-count/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['count'], 1)


class OnlineCountZeroTests(BaseActivityTestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user('alice')
        self.login('alice')

    def test_zero_count_when_no_locations(self):
        response = self.client.get('/api/activities/online-count/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['count'], 0)
