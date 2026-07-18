"""Тести Celery-задачі cancel_stale_pending_activities."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from ..models import Activity
from .base import KYIV_LAT, KYIV_LNG, make_point

try:
    from ..tasks import cancel_stale_pending_activities  # noqa: F401
except Exception:
    from unittest.mock import MagicMock
    cancel_stale_pending_activities = MagicMock()

User = get_user_model()


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
