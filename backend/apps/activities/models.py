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
        CROSS = 'cross', 'Крос'
        ZONE = 'zone', 'Ігрова зона'

    class LiveStatus(models.TextChoices):
        PENDING = 'pending', 'Очікує підтверджень'
        ACTIVE = 'active', 'Триває (live)'
        COMPLETED = 'completed', 'Завершено'
        CANCELLED = 'cancelled', 'Скасовано'

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

    # --- Live-зустріч (реальний час) ---
    # live_status керує тим, чи активна зараз live-сесія: чи можна шерити
    # позицію і бачити маркери учасників на карті. Це НЕ те саме, що
    # started_at (запланований час) — активність може бути 'pending' ще
    # довго після started_at, поки хтось не прийме запрошення.
    live_status = models.CharField(
        max_length=20,
        choices=LiveStatus.choices,
        default=LiveStatus.PENDING,
    )
    geofence_radius_m = models.PositiveIntegerField(
        default=40,
        help_text='Радіус (м) навколо point, при вході в який учасник вважається arrived'
    )
    activated_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Момент першого accept — коли сесія стала live'
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    # --- Крос (тільки для category='cross') ---
    duration_seconds = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Тривалість кросу в секундах (для category=cross)'
    )

    # --- Ігрова зона (тільки для category='zone') ---
    is_friends_only = models.BooleanField(
        default=False,
        help_text='Якщо True — зона видна тільки друзям творця'
    )

    class Meta:
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['live_status']),
        ]

    def __str__(self):
        return f"{self.title} ({self.creator})"

    def activate_if_needed(self):
        """Викликати після першого accept запрошення."""
        if self.live_status == self.LiveStatus.PENDING:
            self.live_status = self.LiveStatus.ACTIVE
            self.activated_at = timezone.now()
            self.save(update_fields=['live_status', 'activated_at'])

    def cancel(self):
        """
        Творець виходить/завершує свій live-збір достроково (кнопка «Вийти»
        на фронті). completed_at тут використовується як загальний
        "коли перестав бути live", незалежно від причини завершення.
        """
        if self.live_status == self.LiveStatus.ACTIVE:
            self.live_status = self.LiveStatus.CANCELLED
            self.completed_at = timezone.now()
            self.save(update_fields=['live_status', 'completed_at'])

            # Real-time WebSocket: notify all participants that activity is cancelled
            try:
                from api.consumers import notify_activity_cancelled
                notify_activity_cancelled(self.pk)
            except Exception:
                pass

    def maybe_complete(self):
        """
        Завершити, коли всі 'accepted'-запрошені прийшли ('arrived').
        Creator у списку Invitation не фігурує (він не запрошує сам себе),
        тому враховуємо лише запрошених — creator вважається учасником
        завжди і окремо позначається arrived на рівні view/serializer.
        """
        live_invitations = self.invitations.filter(
            status__in=[Invitation.Status.ACCEPTED, Invitation.Status.ARRIVED]
        )
        if live_invitations.exists() and all(
            inv.status == Invitation.Status.ARRIVED for inv in live_invitations
        ):
            self.live_status = self.LiveStatus.COMPLETED
            self.completed_at = timezone.now()
            self.save(update_fields=['live_status', 'completed_at'])


class Checkpoint(models.Model):
    """Один чекпоїнт у кросі — позиція на карті + порядок проходження."""
    activity = models.ForeignKey(
        Activity,
        on_delete=models.CASCADE,
        related_name='checkpoints'
    )
    order = models.PositiveIntegerField(
        help_text='Порядок проходження (1, 2, 3 …)'
    )
    point = models.PointField(geography=True)
    radius_m = models.PositiveIntegerField(
        default=30,
        help_text='Радіус (м) навколо чекпоїнту для вважання його пройденим'
    )

    class Meta:
        ordering = ['order']
        constraints = [
            models.UniqueConstraint(
                fields=['activity', 'order'],
                name='unique_checkpoint_order_per_activity'
            )
        ]

    def __str__(self):
        return f"CP#{self.order} ({self.activity})"


class ParticipantCheckpoint(models.Model):
    """Фіксує момент проходження учасником конкретного чекпоїнту."""
    invitation = models.ForeignKey(
        'Invitation',
        on_delete=models.CASCADE,
        related_name='passed_checkpoints'
    )
    checkpoint = models.ForeignKey(
        Checkpoint,
        on_delete=models.CASCADE,
        related_name='passes'
    )
    passed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['invitation', 'checkpoint'],
                name='unique_invitation_checkpoint'
            )
        ]

    def __str__(self):
        return f"{self.invitation} passed {self.checkpoint}"


class Invitation(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Очікує'
        ACCEPTED = 'accepted', 'Прийнято'
        DECLINED = 'declined', 'Відхилено'
        ARRIVED = 'arrived', 'На місці'
        LEFT = 'left', 'Вийшов(ла)'

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

    # --- Live-зустріч (реальний час) ---
    responded_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Коли to_user прийняв/відхилив запрошення'
    )
    arrived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['from_user', 'to_user', 'activity'],
                name='unique_invitation_per_activity'
            )
        ]
        indexes = [
            models.Index(fields=['activity', 'status']),
        ]

    def __str__(self):
        return f"{self.from_user} → {self.to_user} ({self.activity})"

    def accept(self):
        self.status = self.Status.ACCEPTED
        self.responded_at = timezone.now()
        self.save(update_fields=['status', 'responded_at'])
        self.activity.activate_if_needed()

    def decline(self):
        self.status = self.Status.DECLINED
        self.responded_at = timezone.now()
        self.save(update_fields=['status', 'responded_at'])

    def mark_arrived(self):
        self.status = self.Status.ARRIVED
        self.arrived_at = timezone.now()
        self.save(update_fields=['status', 'arrived_at'])
        self.activity.maybe_complete()
        self._notify_participants()

    def leave(self):
        self.status = self.Status.LEFT
        self.save(update_fields=['status'])
        self._notify_participants()

    def _notify_participants(self):
        """Broadcast participant status change to all WebSocket subscribers."""
        try:
            from api.consumers import notify_activity_participants
            participant = {
                'id': self.to_user.id,
                'username': self.to_user.username,
                'status': self.status,
            }
            notify_activity_participants(self.activity_id, participant, self.activity.live_status)
        except Exception:
            pass