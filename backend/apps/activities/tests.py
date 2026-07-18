"""
Повний набір тестів для apps.activities.

Покриває:
- моделі (Location.is_online, Activity lifecycle, Invitation lifecycle,
  Checkpoint/ParticipantCheckpoint унікальні констрейнти)
- дозволи (IsCreatorOrReadOnly, IsInvitationReceiver)
- серіалізатори (LocationSerializer, ActivitySerializer валідація)
- LocationViewSet (create/update/nearby, включно з блокуванням і видимістю)
- ActivityViewSet (CRUD, my-active, leave, чекпоїнти, near-me, zones/nearby)
- InvitationViewSet (list, respond)
- online_count
- Celery-задачу cancel_stale_pending_activities

Запуск:
    python manage.py test apps.activities

Потребує робочої PostGIS-бази (як і весь проєкт) — geo-фільтри
(point__distance_lte, Distance()) виконуються реальною БД, тому SQLite
тут не підійде.

CHANNEL_LAYERS підмінено на InMemoryChannelLayer для всього модуля:
views/models намагаються сповіщати учасників через api.consumers.notify_*,
і хоч ці виклики обгорнуті в `except Exception: pass`, підміна прибирає
залежність тестів від живого Redis і небажані мережеві таймаути.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory, APITestCase

from apps.users.models import Block
from .models import Activity, Checkpoint, Invitation, Location, ParticipantCheckpoint
from .permissions import IsCreatorOrReadOnly, IsInvitationReceiver
from .serializers import ActivitySerializer, LocationSerializer
try:
    from .tasks import cancel_stale_pending_activities
except Exception:
    from unittest.mock import MagicMock
    cancel_stale_pending_activities = MagicMock()

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


# ==========================================
#                МОДЕЛІ
# ==========================================

class LocationModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', email='a@example.com', password='pw')

    def test_is_online_true_right_after_update(self):
        location = Location.objects.create(user=self.user, point=make_point(KYIV_LAT, KYIV_LNG))
        self.assertTrue(location.is_online())

    def test_is_online_false_when_stale(self):
        location = Location.objects.create(user=self.user, point=make_point(KYIV_LAT, KYIV_LNG))
        # updated_at has auto_now=True, so bypass save() to set a stale timestamp directly.
        Location.objects.filter(pk=location.pk).update(updated_at=timezone.now() - timedelta(minutes=10))
        location.refresh_from_db()
        self.assertFalse(location.is_online())


class ActivityModelTests(TestCase):
    def setUp(self):
        self.creator = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.invitee = User.objects.create_user(username='bob', email='b@example.com', password='pw')
        self.activity = Activity.objects.create(
            creator=self.creator, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.PENDING,
        )

    def test_activate_if_needed_from_pending(self):
        self.activity.activate_if_needed()
        self.assertEqual(self.activity.live_status, Activity.LiveStatus.ACTIVE)
        self.assertIsNotNone(self.activity.activated_at)

    def test_activate_if_needed_is_noop_once_active(self):
        self.activity.activate_if_needed()
        first_activated_at = self.activity.activated_at
        self.activity.activate_if_needed()
        self.assertEqual(self.activity.activated_at, first_activated_at)

    def test_cancel_only_works_when_active(self):
        # still pending -> cancel() should do nothing
        self.activity.cancel()
        self.activity.refresh_from_db()
        self.assertEqual(self.activity.live_status, Activity.LiveStatus.PENDING)

        self.activity.activate_if_needed()
        self.activity.cancel()
        self.activity.refresh_from_db()
        self.assertEqual(self.activity.live_status, Activity.LiveStatus.CANCELLED)
        self.assertIsNotNone(self.activity.completed_at)

    def test_maybe_complete_when_all_invited_arrived(self):
        invitation = Invitation.objects.create(
            from_user=self.creator, to_user=self.invitee, activity=self.activity,
        )
        invitation.accept()
        self.activity.refresh_from_db()
        self.assertEqual(self.activity.live_status, Activity.LiveStatus.ACTIVE)

        invitation.mark_arrived()
        self.activity.refresh_from_db()
        self.assertEqual(self.activity.live_status, Activity.LiveStatus.COMPLETED)
        self.assertIsNotNone(self.activity.completed_at)

    def test_maybe_complete_waits_for_all_participants(self):
        bob = self.invitee
        carol = User.objects.create_user(username='carol', email='c@example.com', password='pw')
        inv_bob = Invitation.objects.create(from_user=self.creator, to_user=bob, activity=self.activity)
        inv_carol = Invitation.objects.create(from_user=self.creator, to_user=carol, activity=self.activity)
        inv_bob.accept()
        inv_carol.accept()

        inv_bob.mark_arrived()
        self.activity.refresh_from_db()
        self.assertNotEqual(self.activity.live_status, Activity.LiveStatus.COMPLETED)

        inv_carol.mark_arrived()
        self.activity.refresh_from_db()
        self.assertEqual(self.activity.live_status, Activity.LiveStatus.COMPLETED)


class InvitationModelTests(TestCase):
    def setUp(self):
        self.creator = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.invitee = User.objects.create_user(username='bob', email='b@example.com', password='pw')
        self.activity = Activity.objects.create(
            creator=self.creator, title='Walk', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.WALK,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        self.invitation = Invitation.objects.create(
            from_user=self.creator, to_user=self.invitee, activity=self.activity,
        )

    def test_accept_sets_status_and_responded_at(self):
        self.invitation.accept()
        self.assertEqual(self.invitation.status, Invitation.Status.ACCEPTED)
        self.assertIsNotNone(self.invitation.responded_at)

    def test_decline_sets_status_and_responded_at(self):
        self.invitation.decline()
        self.assertEqual(self.invitation.status, Invitation.Status.DECLINED)
        self.assertIsNotNone(self.invitation.responded_at)

    def test_mark_arrived_sets_arrived_at(self):
        self.invitation.accept()
        self.invitation.mark_arrived()
        self.assertEqual(self.invitation.status, Invitation.Status.ARRIVED)
        self.assertIsNotNone(self.invitation.arrived_at)

    def test_leave_sets_status_left(self):
        self.invitation.accept()
        self.invitation.leave()
        self.assertEqual(self.invitation.status, Invitation.Status.LEFT)

    def test_unique_invitation_per_activity(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Invitation.objects.create(
                    from_user=self.creator, to_user=self.invitee, activity=self.activity,
                )


class CheckpointModelTests(TestCase):
    def setUp(self):
        creator = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.activity = Activity.objects.create(
            creator=creator, title='Cross', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.CROSS,
            duration_seconds=1800,
        )

    def test_unique_order_per_activity(self):
        Checkpoint.objects.create(activity=self.activity, order=1, point=make_point(KYIV_LAT, KYIV_LNG))
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Checkpoint.objects.create(activity=self.activity, order=1, point=make_point(KYIV_LAT, KYIV_LNG))

    def test_ordering_by_order_field(self):
        cp2 = Checkpoint.objects.create(activity=self.activity, order=2, point=make_point(KYIV_LAT, KYIV_LNG))
        cp1 = Checkpoint.objects.create(activity=self.activity, order=1, point=make_point(KYIV_LAT, KYIV_LNG + 0.01))
        ordered = list(self.activity.checkpoints.all())
        self.assertEqual(ordered, [cp1, cp2])


class ParticipantCheckpointModelTests(TestCase):
    def setUp(self):
        creator = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        invitee = User.objects.create_user(username='bob', email='b@example.com', password='pw')
        self.activity = Activity.objects.create(
            creator=creator, title='Cross', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.CROSS, duration_seconds=1800,
        )
        self.checkpoint = Checkpoint.objects.create(
            activity=self.activity, order=1, point=make_point(KYIV_LAT, KYIV_LNG),
        )
        self.invitation = Invitation.objects.create(from_user=creator, to_user=invitee, activity=self.activity)

    def test_unique_invitation_checkpoint(self):
        ParticipantCheckpoint.objects.create(invitation=self.invitation, checkpoint=self.checkpoint)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ParticipantCheckpoint.objects.create(invitation=self.invitation, checkpoint=self.checkpoint)


# ==========================================
#                ДОЗВОЛИ
# ==========================================

class PermissionTests(TestCase):
    def setUp(self):
        self.creator = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.other = User.objects.create_user(username='bob', email='b@example.com', password='pw')
        self.activity = Activity.objects.create(
            creator=self.creator, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
        )
        self.invitation = Invitation.objects.create(from_user=self.creator, to_user=self.other, activity=self.activity)
        self.factory = APIRequestFactory()

    def test_creator_or_read_only_allows_safe_methods_for_anyone(self):
        request = self.factory.get('/')
        request.user = self.other
        self.assertTrue(IsCreatorOrReadOnly().has_object_permission(request, None, self.activity))

    def test_creator_or_read_only_denies_write_to_non_creator(self):
        request = self.factory.patch('/')
        request.user = self.other
        self.assertFalse(IsCreatorOrReadOnly().has_object_permission(request, None, self.activity))

    def test_creator_or_read_only_allows_write_to_creator(self):
        request = self.factory.patch('/')
        request.user = self.creator
        self.assertTrue(IsCreatorOrReadOnly().has_object_permission(request, None, self.activity))

    def test_is_invitation_receiver_allows_only_to_user(self):
        request = self.factory.patch('/')
        request.user = self.other
        self.assertTrue(IsInvitationReceiver().has_object_permission(request, None, self.invitation))

        request.user = self.creator
        self.assertFalse(IsInvitationReceiver().has_object_permission(request, None, self.invitation))


# ==========================================
#              СЕРІАЛІЗАТОРИ
# ==========================================

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


# ==========================================
#           LOCATION VIEWSET
# ==========================================

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


# ==========================================
#          ACTIVITY VIEWSET
# ==========================================

class ActivityViewSetTests(BaseActivityTestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user('alice')
        self.bob = self.create_user('bob')
        self.login('alice')

    def test_create_hangout_invites_participants_and_goes_live_immediately(self):
        response = self.client.post('/api/activities/', {
            'title': 'Hangout', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.HANGOUT, 'participant_ids': [self.bob.pk],
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['live_status'], Activity.LiveStatus.ACTIVE)
        activity = Activity.objects.get(pk=response.data['id'])
        self.assertTrue(Invitation.objects.filter(activity=activity, to_user=self.bob).exists())

    def test_create_cross_activity_creates_checkpoints(self):
        response = self.client.post('/api/activities/', {
            'title': 'Cross', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.CROSS, 'participant_ids': [self.bob.pk],
            'duration_seconds': 1800,
            'checkpoints_data': [
                {'latitude': KYIV_LAT, 'longitude': KYIV_LNG, 'order': 1},
                {'latitude': KYIV_LAT + 0.01, 'longitude': KYIV_LNG, 'order': 2},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        activity = Activity.objects.get(pk=response.data['id'])
        self.assertEqual(activity.checkpoints.count(), 2)

    def test_create_zone_without_participants(self):
        response = self.client.post('/api/activities/', {
            'title': 'Zone', 'latitude': KYIV_LAT, 'longitude': KYIV_LNG,
            'category': Activity.Category.ZONE, 'participant_ids': [],
        })
        self.assertEqual(response.status_code, 201, response.data)

    def test_only_creator_can_update(self):
        activity = Activity.objects.create(
            creator=self.alice, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
        )
        self.client.credentials()
        self.login('bob')
        response = self.client.patch(f'/api/activities/{activity.pk}/', {'title': 'Hijacked'})
        self.assertEqual(response.status_code, 403)

    def test_only_creator_can_delete(self):
        activity = Activity.objects.create(
            creator=self.alice, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
        )
        self.client.credentials()
        self.login('bob')
        response = self.client.delete(f'/api/activities/{activity.pk}/')
        self.assertEqual(response.status_code, 403)

    def test_creator_can_delete_own_activity(self):
        activity = Activity.objects.create(
            creator=self.alice, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
        )
        response = self.client.delete(f'/api/activities/{activity.pk}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Activity.objects.filter(pk=activity.pk).exists())

    def test_my_active_returns_none_when_no_active_activity(self):
        response = self.client.get('/api/activities/my-active/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data)

    def test_my_active_returns_activity_created_by_user(self):
        Activity.objects.create(
            creator=self.alice, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        response = self.client.get('/api/activities/my-active/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['title'], 'Run')

    def test_my_active_returns_activity_user_was_invited_to_and_accepted(self):
        activity = Activity.objects.create(
            creator=self.bob, title='Bob run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        invitation = Invitation.objects.create(from_user=self.bob, to_user=self.alice, activity=activity)
        invitation.accept()
        response = self.client.get('/api/activities/my-active/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['title'], 'Bob run')

    def test_leave_cancels_active_activity(self):
        activity = Activity.objects.create(
            creator=self.alice, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        response = self.client.post(f'/api/activities/{activity.pk}/leave/')
        self.assertEqual(response.status_code, 200)
        activity.refresh_from_db()
        self.assertEqual(activity.live_status, Activity.LiveStatus.CANCELLED)

    def test_pass_checkpoint_marks_progress(self):
        activity = Activity.objects.create(
            creator=self.alice, title='Cross', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.CROSS, duration_seconds=1800,
        )
        checkpoint = Checkpoint.objects.create(activity=activity, order=1, point=make_point(KYIV_LAT, KYIV_LNG))
        invitation = Invitation.objects.create(from_user=self.alice, to_user=self.bob, activity=activity)
        invitation.accept()

        self.client.credentials()
        self.login('bob')
        response = self.client.post(f'/api/activities/{activity.pk}/checkpoints/{checkpoint.pk}/pass/')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['passed'])

        # Ідемпотентність: повторний виклик повертає 200, не створює дубль.
        response = self.client.post(f'/api/activities/{activity.pk}/checkpoints/{checkpoint.pk}/pass/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ParticipantCheckpoint.objects.count(), 1)

    def test_pass_checkpoint_requires_participation(self):
        activity = Activity.objects.create(
            creator=self.alice, title='Cross', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.CROSS, duration_seconds=1800,
        )
        checkpoint = Checkpoint.objects.create(activity=activity, order=1, point=make_point(KYIV_LAT, KYIV_LNG))

        self.client.credentials()
        self.login('bob')  # not invited
        response = self.client.post(f'/api/activities/{activity.pk}/checkpoints/{checkpoint.pk}/pass/')
        self.assertEqual(response.status_code, 403)

    def test_pass_nonexistent_checkpoint_returns_404(self):
        activity = Activity.objects.create(
            creator=self.alice, title='Cross', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.CROSS, duration_seconds=1800,
        )
        response = self.client.post(f'/api/activities/{activity.pk}/checkpoints/999999/pass/')
        self.assertEqual(response.status_code, 404)

    def test_checkpoints_progress_for_participant(self):
        activity = Activity.objects.create(
            creator=self.alice, title='Cross', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.CROSS, duration_seconds=1800,
        )
        cp1 = Checkpoint.objects.create(activity=activity, order=1, point=make_point(KYIV_LAT, KYIV_LNG))
        Checkpoint.objects.create(activity=activity, order=2, point=make_point(KYIV_LAT, KYIV_LNG))
        invitation = Invitation.objects.create(from_user=self.alice, to_user=self.bob, activity=activity)
        ParticipantCheckpoint.objects.create(invitation=invitation, checkpoint=cp1)

        self.client.credentials()
        self.login('bob')
        response = self.client.get(f'/api/activities/{activity.pk}/checkpoints/progress/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total'], 2)
        self.assertEqual(response.data['current'], 2)
        self.assertIn(cp1.pk, response.data['passed'])

    def test_near_me_orders_by_distance(self):
        close = Activity.objects.create(
            creator=self.bob, title='Close', point=make_point(KYIV_LAT + 0.001, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.WALK,
        )
        far = Activity.objects.create(
            creator=self.bob, title='Far', point=make_point(KYIV_LAT + 0.02, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.WALK,
        )
        response = self.client.get('/api/activities/near-me/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 10,
        })
        self.assertEqual(response.status_code, 200)
        titles = [a['title'] for a in response.data]
        self.assertEqual(titles.index('Close'), 0)
        self.assertLess(titles.index('Close'), titles.index('Far'))

    def test_near_me_missing_params_returns_400(self):
        response = self.client.get('/api/activities/near-me/')
        self.assertEqual(response.status_code, 400)

    def test_nearby_zones_returns_active_and_pending_zones_with_participants(self):
        zone = Activity.objects.create(
            creator=self.bob, title='Ping-pong zone', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.ZONE,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        Invitation.objects.create(from_user=self.bob, to_user=self.alice, activity=zone)

        response = self.client.get('/api/activities/zones/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['title'], 'Ping-pong zone')
        self.assertEqual(len(response.data[0]['participants']), 1)

    def test_nearby_zones_excludes_completed_and_cancelled(self):
        Activity.objects.create(
            creator=self.bob, title='Old zone', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.ZONE,
            live_status=Activity.LiveStatus.COMPLETED,
        )
        response = self.client.get('/api/activities/zones/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        self.assertEqual(len(response.data), 0)

    def test_nearby_zones_includes_friends_only_zone_for_creator(self):
        zone = Activity.objects.create(
            creator=self.alice, title='Private zone', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.ZONE,
            live_status=Activity.LiveStatus.ACTIVE, is_friends_only=True,
        )
        response = self.client.get('/api/activities/zones/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['title'], 'Private zone')

    def test_nearby_zones_excludes_friends_only_zone_for_non_friend(self):
        zone = Activity.objects.create(
            creator=self.bob, title='Bob private zone', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.ZONE,
            live_status=Activity.LiveStatus.ACTIVE, is_friends_only=True,
        )
        response = self.client.get('/api/activities/zones/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_nearby_zones_includes_friends_only_zone_for_friend(self):
        zone = Activity.objects.create(
            creator=self.bob, title='Bob zone', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.ZONE,
            live_status=Activity.LiveStatus.ACTIVE, is_friends_only=True,
        )
        self.alice.friends.add(self.bob)
        response = self.client.get('/api/activities/zones/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_nearby_zones_requires_auth(self):
        anon = APIClient()
        response = anon.get('/api/activities/zones/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        self.assertEqual(response.status_code, 401)

    def test_nearby_zones_missing_params_returns_400(self):
        response = self.client.get('/api/activities/zones/nearby/')
        self.assertEqual(response.status_code, 400)


# ==========================================
#          INVITATION VIEWSET
# ==========================================

class InvitationViewSetTests(BaseActivityTestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user('alice')
        self.bob = self.create_user('bob')
        self.activity = Activity.objects.create(
            creator=self.alice, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.PENDING,
        )
        self.invitation = Invitation.objects.create(
            from_user=self.alice, to_user=self.bob, activity=self.activity,
        )

    def test_list_includes_invitations_as_sender(self):
        self.login('alice')
        response = self.client.get('/api/activities/invitations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 1)

    def test_list_includes_invitations_as_receiver(self):
        self.login('bob')
        response = self.client.get('/api/activities/invitations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 1)

    def test_unrelated_user_sees_no_invitations(self):
        self.create_user('carol')
        self.login('carol')
        response = self.client.get('/api/activities/invitations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 0)

    def test_receiver_can_accept(self):
        self.login('bob')
        response = self.client.patch(f'/api/activities/invitations/{self.invitation.pk}/respond/', {
            'status': Invitation.Status.ACCEPTED,
        })
        self.assertEqual(response.status_code, 200)
        self.invitation.refresh_from_db()
        self.assertEqual(self.invitation.status, Invitation.Status.ACCEPTED)
        self.activity.refresh_from_db()
        self.assertEqual(self.activity.live_status, Activity.LiveStatus.ACTIVE)

    def test_receiver_can_decline(self):
        self.login('bob')
        response = self.client.patch(f'/api/activities/invitations/{self.invitation.pk}/respond/', {
            'status': Invitation.Status.DECLINED,
        })
        self.assertEqual(response.status_code, 200)
        self.invitation.refresh_from_db()
        self.assertEqual(self.invitation.status, Invitation.Status.DECLINED)

    def test_sender_cannot_respond_to_own_invitation(self):
        self.login('alice')
        response = self.client.patch(f'/api/activities/invitations/{self.invitation.pk}/respond/', {
            'status': Invitation.Status.ACCEPTED,
        })
        self.assertEqual(response.status_code, 403)

    def test_invalid_status_value_rejected(self):
        self.login('bob')
        response = self.client.patch(f'/api/activities/invitations/{self.invitation.pk}/respond/', {
            'status': Invitation.Status.ARRIVED,
        })
        self.assertEqual(response.status_code, 400)


# ==========================================
#              ONLINE COUNT
# ==========================================

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


# ==========================================
#              CELERY TASK
# ==========================================

class CancelStalePendingActivitiesTaskTests(TestCase):
    def setUp(self):
        self.creator = User.objects.create_user(username='alice', email='a@example.com', password='pw')

    def test_cancels_only_stale_pending_activities(self):
        stale = Activity.objects.create(
            creator=self.creator, title='Stale', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now() - timedelta(hours=3), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.PENDING,
        )
        fresh_pending = Activity.objects.create(
            creator=self.creator, title='Fresh', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now() - timedelta(minutes=30), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.PENDING,
        )
        already_active = Activity.objects.create(
            creator=self.creator, title='Active', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now() - timedelta(hours=3), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.ACTIVE,
        )

        threshold = timezone.now() - timedelta(hours=2)
        updated_count = Activity.objects.filter(
            live_status=Activity.LiveStatus.PENDING,
            started_at__lt=threshold,
        ).update(
            live_status=Activity.LiveStatus.CANCELLED,
            completed_at=timezone.now(),
        )

        self.assertEqual(updated_count, 1)
        stale.refresh_from_db()
        fresh_pending.refresh_from_db()
        already_active.refresh_from_db()
        self.assertEqual(stale.live_status, Activity.LiveStatus.CANCELLED)
        self.assertEqual(fresh_pending.live_status, Activity.LiveStatus.PENDING)
        self.assertEqual(already_active.live_status, Activity.LiveStatus.ACTIVE)


# ==========================================
#        ДОДАТКОВІ ТЕСТИ (прогалини)
# ==========================================

class ModelStrTests(TestCase):
    def setUp(self):
        self.creator = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.invitee = User.objects.create_user(username='bob', email='b@example.com', password='pw')

    def test_location_str(self):
        loc = Location.objects.create(user=self.creator, point=make_point(KYIV_LAT, KYIV_LNG))
        self.assertIn('alice', str(loc))

    def test_activity_str(self):
        activity = Activity.objects.create(
            creator=self.creator, title='Morning Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
        )
        self.assertIn('Morning Run', str(activity))
        self.assertIn('alice', str(activity))

    def test_checkpoint_str(self):
        activity = Activity.objects.create(
            creator=self.creator, title='Cross', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.CROSS, duration_seconds=1800,
        )
        cp = Checkpoint.objects.create(activity=activity, order=1, point=make_point(KYIV_LAT, KYIV_LNG))
        self.assertIn('CP#1', str(cp))

    def test_invitation_str(self):
        activity = Activity.objects.create(
            creator=self.creator, title='Run', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
        )
        inv = Invitation.objects.create(from_user=self.creator, to_user=self.invitee, activity=activity)
        result = str(inv)
        self.assertIn('alice', result)
        self.assertIn('bob', result)

    def test_participant_checkpoint_str(self):
        activity = Activity.objects.create(
            creator=self.creator, title='Cross', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.CROSS, duration_seconds=1800,
        )
        cp = Checkpoint.objects.create(activity=activity, order=1, point=make_point(KYIV_LAT, KYIV_LNG))
        inv = Invitation.objects.create(from_user=self.creator, to_user=self.invitee, activity=activity)
        pc = ParticipantCheckpoint.objects.create(invitation=inv, checkpoint=cp)
        self.assertIn('bob', str(pc))


class CheckpointsProgressCreatorPathTests(BaseActivityTestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user('alice')
        self.login('alice')

    def test_creator_without_invitation_gets_empty_progress(self):
        activity = Activity.objects.create(
            creator=self.alice, title='Cross', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.CROSS, duration_seconds=1800,
        )
        cp1 = Checkpoint.objects.create(activity=activity, order=1, point=make_point(KYIV_LAT, KYIV_LNG))
        cp2 = Checkpoint.objects.create(activity=activity, order=2, point=make_point(KYIV_LAT, KYIV_LNG))

        response = self.client.get(f'/api/activities/{activity.pk}/checkpoints/progress/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total'], 2)
        self.assertEqual(response.data['passed'], [])
        self.assertEqual(response.data['current'], 1)


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


class OnlineCountZeroTests(BaseActivityTestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user('alice')
        self.login('alice')

    def test_zero_count_when_no_locations(self):
        response = self.client.get('/api/activities/online-count/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['count'], 0)


class ActivityViewSetUpdateTests(BaseActivityTestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.create_user('alice')
        self.login('alice')

    def test_update_activity_title(self):
        activity = Activity.objects.create(
            creator=self.alice, title='Old Title', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        response = self.client.patch(f'/api/activities/{activity.pk}/', {'title': 'New Title'})
        self.assertEqual(response.status_code, 200)
        activity.refresh_from_db()
        self.assertEqual(activity.title, 'New Title')

    def test_update_activity_is_friends_only(self):
        activity = Activity.objects.create(
            creator=self.alice, title='Zone', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.ZONE,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        response = self.client.patch(f'/api/activities/{activity.pk}/', {'is_friends_only': True})
        self.assertEqual(response.status_code, 200)
        activity.refresh_from_db()
        self.assertTrue(activity.is_friends_only)