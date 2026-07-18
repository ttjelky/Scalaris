"""
Тести моделей apps.activities:
- Location.is_online
- Activity lifecycle (activate_if_needed, cancel, maybe_complete)
- Invitation lifecycle (accept/decline/mark_arrived/leave)
- Checkpoint / ParticipantCheckpoint унікальні констрейнти
- __str__ представлення моделей
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from ..models import Activity, Checkpoint, Invitation, Location, ParticipantCheckpoint
from .base import KYIV_LAT, KYIV_LNG, make_point

User = get_user_model()


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
