from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET

from ..models import Location


@require_GET
def online_count(request):
    """Повертає кількість користувачів, які зараз онлайн (оновлювали позицію за останні 5 хв)."""
    cutoff = timezone.now() - timedelta(minutes=5)
    count = Location.objects.filter(updated_at__gte=cutoff).count()
    return JsonResponse({'count': count})
