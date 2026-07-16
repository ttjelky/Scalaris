from celery import shared_task
from django.utils import timezone

from .models import Activity


@shared_task
def cancel_stale_pending_activities() -> int:
    """Автоматично скасовує активності, що залишаються в pending більше 2 годин."""
    threshold = timezone.now() - timezone.timedelta(hours=2)
    queryset = Activity.objects.filter(
        live_status=Activity.LiveStatus.PENDING,
        started_at__lt=threshold,
    )

    updated_count = queryset.update(
        live_status=Activity.LiveStatus.CANCELLED,
        completed_at=timezone.now(),
    )
    return updated_count
