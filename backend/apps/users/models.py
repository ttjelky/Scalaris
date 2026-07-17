from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError


class User(AbstractUser):
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    bio = models.CharField(max_length=280, blank=True)
    phone = models.CharField(max_length=32, blank=True, default='')
    is_visible_on_map = models.BooleanField(default=True)
    discord_id = models.CharField(max_length=32, unique=True, blank=True, null=True)
    discord_username = models.CharField(max_length=64, blank=True)

    telegram_id = models.CharField(max_length=32, blank=True, null=True, unique=True)
    telegram_username = models.CharField(max_length=64, blank=True)

    friends = models.ManyToManyField('self', blank=True, symmetrical=True)

    def __str__(self):
        return self.username


class Block(models.Model):
    """blocker перестає бачити blocked на карті, і навпаки (взаємно)."""

    blocker = models.ForeignKey(User, related_name='blocking', on_delete=models.CASCADE)
    blocked = models.ForeignKey(User, related_name='blocked_by', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('blocker', 'blocked')

    def __str__(self):
        return f'{self.blocker} blocked {self.blocked}'


class Report(models.Model):
    class Reason(models.TextChoices):
        SPAM = 'spam', 'Спам'
        HARASSMENT = 'harassment', 'Переслідування або образи'
        FAKE = 'fake', 'Фейковий акаунт'
        INAPPROPRIATE = 'inappropriate', 'Неприйнятний контент'
        OTHER = 'other', 'Інше'

    reporter = models.ForeignKey(User, related_name='reports_made', on_delete=models.CASCADE)
    reported = models.ForeignKey(User, related_name='reports_received', on_delete=models.CASCADE)
    reason = models.CharField(max_length=20, choices=Reason.choices)
    details = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.reporter} reported {self.reported} ({self.reason})'


class TelegramLinkCode(models.Model):
    """Одноразовий код для привʼязки Telegram без Login Widget (без вимоги
    до публічного домену). Юзер тисне "Підключити" → бекенд генерує код →
    фронтенд відкриває t.me/<bot>?start=<code> → бот (окремий polling-процес,
    див. management command telegram_bot) знаходить код і привʼязує акаунт.
    """

    LIFETIME_MINUTES = 10

    user = models.ForeignKey(User, related_name='telegram_link_codes', on_delete=models.CASCADE)
    code = models.CharField(max_length=16, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def generate_for(cls, user):
        # Прибираємо старі коди цього юзера — на кожен клік "Підключити"
        # має діяти лише останній код.
        cls.objects.filter(user=user).delete()
        code = secrets.token_urlsafe(8).replace('-', '').replace('_', '')[:12]
        return cls.objects.create(user=user, code=code)

    def is_expired(self):
        return timezone.now() - self.created_at > timezone.timedelta(minutes=self.LIFETIME_MINUTES)

    def __str__(self):
        return f'{self.code} -> {self.user}'
    
class FriendRequest(models.Model):
    """Модель для відстеження надісланих та отриманих запитів у друзі."""
    from_user = models.ForeignKey(User, related_name='sent_friend_requests', on_delete=models.CASCADE)
    to_user = models.ForeignKey(User, related_name='received_friend_requests', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('from_user', 'to_user')

    def clean(self):
        # Забороняємо надсилати запит самому собі
        if self.from_user == self.to_user:
            raise ValidationError("Не можна надіслати запит у друзі самому собі.")

    def __str__(self):
        return f'{self.from_user} -> {self.to_user}'
