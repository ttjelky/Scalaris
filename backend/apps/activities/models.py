from datetime import timedelta

from django.conf import settings
from django.contrib.gis.db import models
from django.utils import timezone


class Location(models.Model):
    """Поточна геопозиція користувача. Один запис на юзера — оновлюється при кожному пінгу."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='location'
    )
    point = models.PointField(geography=True)  # SRID 4326
    updated_at = models.DateTimeField(auto_now=True)

    def is_online(self, minutes=5):
        return timezone.now() - self.updated_at < timedelta(minutes=minutes)

    def __str__(self):
        return f"{self.user} @ {self.updated_at:%H:%M:%S}"


class Activity(models.Model):
    class Category(models.TextChoices):
        SPORT = 'sport', 'Спорт'
        WALK = 'walk', 'Прогулянка'
        HANGOUT = 'hangout', 'Тусовка'

    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='activities'
    )
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    point = models.PointField(geography=True)
    started_at = models.DateTimeField()
    category = models.CharField(max_length=20, choices=Category.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"{self.title} ({self.creator})"


class Invitation(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Очікує'
        ACCEPTED = 'accepted', 'Прийнято'
        DECLINED = 'declined', 'Відхилено'

    from_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sent_invitations'
    )
    to_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='received_invitations'
    )
    activity = models.ForeignKey(
        Activity,
        on_delete=models.CASCADE,
        related_name='invitations'
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['from_user', 'to_user', 'activity'],
                name='unique_invitation_per_activity'
            )
        ]

    def __str__(self):
        return f"{self.from_user} → {self.to_user} ({self.activity})"