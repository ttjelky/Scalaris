"""Тести серіалізаторів: LocationSerializer, ActivitySerializer валідація."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from ..models import Activity
from ..serializers import ActivitySerializer, LocationSerializer
from .base import KYIV_LAT, KYIV_LNG

User = get_user_model()


class LocationSerializerTests(TestCase):
    def test_valid_lat_lng(self):
        serializer = LocationSerializer(data={'latitude': KYIV_LAT, 'longitude': KYIV_LNG})
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_latitude_out_of_range_rejected(self):
        serializer = LocationSerializer(data={'latitude': 120, 'longitude': KYIV_LNG})
        self.assertFalse(serializer.is_valid())
        self.assertIn('latitude', serializer.errors)

    def test_longitude_out_of_range_rejected(self):
        serializer = LocationSerializer(data={'latitude': KYIV_LAT, 'longitude': 200})
        self.assertFalse(serializer.is_valid())
        self.assertIn('longitude', serializer.errors)


class ActivitySerializerValidationTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.creator = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.invitee = User.objects.create_user(username='bob', email='b@example.com', password='pw')

    def _context(self):
        request = self.factory.post('/')
        request.user = self.creator
        return {'request': request}

    def test_non_zone_requires_at_least_one_participant(self):
        serializer = ActivitySerializer(data={
            'title': 'Walk', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.WALK, 'participant_ids': [],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('participant_ids', serializer.errors)

    def test_zone_does_not_require_participants(self):
        serializer = ActivitySerializer(data={
            'title': 'Zone', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.ZONE, 'participant_ids': [],
        }, context=self._context())
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_zone_requires_title(self):
        serializer = ActivitySerializer(data={
            'title': '', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.ZONE, 'participant_ids': [],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('title', serializer.errors)

    def test_zone_requires_latitude_and_longitude(self):
        serializer = ActivitySerializer(data={
            'title': 'Zone', 'category': Activity.Category.ZONE, 'participant_ids': [],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('latitude', serializer.errors)

    def test_zone_with_is_friends_only(self):
        serializer = ActivitySerializer(data={
            'title': 'Private Zone', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.ZONE, 'participant_ids': [],
            'is_friends_only': True,
        }, context=self._context())
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_hangout_requires_participants(self):
        serializer = ActivitySerializer(data={
            'title': 'Hangout', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.HANGOUT, 'participant_ids': [],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('participant_ids', serializer.errors)

    def test_cannot_invite_self(self):
        serializer = ActivitySerializer(data={
            'title': 'Walk', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.WALK, 'participant_ids': [self.creator.pk],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())

    def test_too_many_participants_rejected(self):
        users = [
            User.objects.create_user(username=f'u{i}', email=f'u{i}@example.com', password='pw')
            for i in range(9)
        ]
        serializer = ActivitySerializer(data={
            'title': 'Hangout', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.HANGOUT, 'participant_ids': [u.pk for u in users],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())

    def test_cross_requires_at_least_two_checkpoints(self):
        serializer = ActivitySerializer(data={
            'title': 'Cross', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.CROSS, 'participant_ids': [self.invitee.pk],
            'duration_seconds': 1800,
            'checkpoints_data': [{'latitude': KYIV_LAT, 'longitude': KYIV_LNG, 'order': 1}],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('checkpoints_data', serializer.errors)

    def test_cross_requires_duration(self):
        serializer = ActivitySerializer(data={
            'title': 'Cross', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.CROSS, 'participant_ids': [self.invitee.pk],
            'checkpoints_data': [
                {'latitude': KYIV_LAT, 'longitude': KYIV_LNG, 'order': 1},
                {'latitude': KYIV_LAT, 'longitude': KYIV_LNG, 'order': 2},
            ],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('duration_seconds', serializer.errors)

    def test_cross_checkpoint_order_must_be_sequential(self):
        serializer = ActivitySerializer(data={
            'title': 'Cross', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.CROSS, 'participant_ids': [self.invitee.pk],
            'duration_seconds': 1800,
            'checkpoints_data': [
                {'latitude': KYIV_LAT, 'longitude': KYIV_LNG, 'order': 1},
                {'latitude': KYIV_LAT, 'longitude': KYIV_LNG, 'order': 3},
            ],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('checkpoints_data', serializer.errors)

    def test_valid_cross_activity(self):
        serializer = ActivitySerializer(data={
            'title': 'Cross', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.CROSS, 'participant_ids': [self.invitee.pk],
            'duration_seconds': 1800,
            'checkpoints_data': [
                {'latitude': KYIV_LAT, 'longitude': KYIV_LNG, 'order': 1},
                {'latitude': KYIV_LAT, 'longitude': KYIV_LNG, 'order': 2},
            ],
        }, context=self._context())
        self.assertTrue(serializer.is_valid(), serializer.errors)


class ActivitySerializerEdgeCaseTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.creator = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.bob = User.objects.create_user(username='bob', email='b@example.com', password='pw')

    def _context(self):
        request = self.factory.post('/')
        request.user = self.creator
        return {'request': request}

    def test_latitude_without_longitude_rejected(self):
        serializer = ActivitySerializer(data={
            'title': 'Walk', 'latitude': KYIV_LAT,
            'category': Activity.Category.WALK, 'participant_ids': [self.bob.pk],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('longitude', serializer.errors)

    def test_longitude_without_latitude_rejected(self):
        serializer = ActivitySerializer(data={
            'title': 'Walk', 'longitude': KYIV_LNG,
            'category': Activity.Category.WALK, 'participant_ids': [self.bob.pk],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('latitude', serializer.errors)

    def test_duplicate_participants_rejected(self):
        serializer = ActivitySerializer(data={
            'title': 'Walk', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.WALK,
            'participant_ids': [self.bob.pk, self.bob.pk],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('participant_ids', serializer.errors)

    def test_latitude_out_of_range_rejected(self):
        serializer = ActivitySerializer(data={
            'title': 'Zone', 'latitude': 999, 'longitude': KYIV_LNG,
            'category': Activity.Category.ZONE, 'participant_ids': [],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('latitude', serializer.errors)

    def test_longitude_out_of_range_rejected(self):
        serializer = ActivitySerializer(data={
            'title': 'Zone', 'latitude': KYIV_LAT, 'longitude': 999,
            'category': Activity.Category.ZONE, 'participant_ids': [],
        }, context=self._context())
        self.assertFalse(serializer.is_valid())
        self.assertIn('longitude', serializer.errors)
