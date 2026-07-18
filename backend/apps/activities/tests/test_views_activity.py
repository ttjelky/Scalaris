"""Тести ActivityViewSet: CRUD, my-active, leave, чекпоїнти, near-me, zones/nearby."""
from django.utils import timezone
from rest_framework.test import APIClient

from ..models import Activity, Checkpoint, Invitation, ParticipantCheckpoint
from .base import BaseActivityTestCase, KYIV_LAT, KYIV_LNG, make_point


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
        zones = response.data['zones']
        self.assertEqual(len(zones), 1)
        self.assertEqual(zones[0]['title'], 'Ping-pong zone')
        self.assertEqual(len(zones[0]['participants']), 1)

    def test_nearby_zones_excludes_completed_and_cancelled(self):
        Activity.objects.create(
            creator=self.bob, title='Old zone', point=make_point(KYIV_LAT, KYIV_LNG),
            started_at=timezone.now(), category=Activity.Category.ZONE,
            live_status=Activity.LiveStatus.COMPLETED,
        )
        response = self.client.get('/api/activities/zones/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        self.assertEqual(len(response.data['zones']), 0)

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
        zones = response.data['zones']
        self.assertEqual(len(zones), 1)
        self.assertEqual(zones[0]['title'], 'Private zone')

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
        self.assertEqual(len(response.data['zones']), 0)

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
        self.assertEqual(len(response.data['zones']), 1)

    def test_nearby_zones_requires_auth(self):
        anon = APIClient()
        response = anon.get('/api/activities/zones/nearby/', {
            'lat': KYIV_LAT, 'lng': KYIV_LNG, 'radius': 5,
        })
        self.assertEqual(response.status_code, 401)

    def test_nearby_zones_missing_params_returns_400(self):
        response = self.client.get('/api/activities/zones/nearby/')
        self.assertEqual(response.status_code, 400)


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
        Checkpoint.objects.create(activity=activity, order=1, point=make_point(KYIV_LAT, KYIV_LNG))
        Checkpoint.objects.create(activity=activity, order=2, point=make_point(KYIV_LAT, KYIV_LNG))

        response = self.client.get(f'/api/activities/{activity.pk}/checkpoints/progress/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total'], 2)
        self.assertEqual(response.data['passed'], [])
        self.assertEqual(response.data['current'], 1)
