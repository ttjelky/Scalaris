from datetime import timedelta
from django.contrib.gis.geos import Point
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.users.models import User
from apps.users.serializers import UserPublicSerializer
from .models import Location, Activity, Invitation


class LocationSerializer(serializers.ModelSerializer):
    """
    Приймає latitude/longitude окремо (як шле мобільний клієнт),
    зберігає як Point. При кожному запиті — upsert позиції поточного юзера.
    """
    latitude = serializers.FloatField(write_only=True)
    longitude = serializers.FloatField(write_only=True)
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = ['id', 'latitude', 'longitude', 'updated_at', 'is_online']
        read_only_fields = ['id', 'updated_at']

    def validate_latitude(self, value):
        if not -90.0 <= value <= 90.0:
            raise serializers.ValidationError("Широта повинна бути в діапазоні від -90 до 90.")
        return value

    def validate_longitude(self, value):
        if not -180.0 <= value <= 180.0:
            raise serializers.ValidationError("Довгота повинна бути в діапазоні від -180 до 180.")
        return value

    def get_is_online(self, obj):
        return obj.is_online()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['latitude'] = instance.point.y
        data['longitude'] = instance.point.x
        return data

    def create(self, validated_data):
        lat = validated_data.pop('latitude')
        lng = validated_data.pop('longitude')
        point = Point(lng, lat, srid=4326)  # X=longitude, Y=latitude
        user = self.context['request'].user
        location, _ = Location.objects.update_or_create(
            user=user, defaults={'point': point}
        )
        return location


class ActivityParticipantSerializer(serializers.ModelSerializer):
    """
    Один запрошений на активність, сплющено в {..user fields.., status} —
    зручно рендерити як список чіпів "ім'я + бейдж статусу" на фронті.
    """

    class Meta:
        model = Invitation
        fields = ['status']

    def to_representation(self, instance):
        data = UserPublicSerializer(instance.to_user).data
        data['status'] = instance.status
        return data


class ActivitySerializer(serializers.ModelSerializer):
    """
    Створення/редагування/детальний перегляд однієї активності.
    """
    MAX_PARTICIPANTS = 8

    creator = UserPublicSerializer(read_only=True)
    latitude = serializers.FloatField(write_only=True)
    longitude = serializers.FloatField(write_only=True)
    participant_ids = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        many=True,
        write_only=True,
        required=True,
        allow_empty=False,
        help_text='Список id користувачів, яких запрошуємо. Мінімум 1, максимум 8.'
    )
    # Всі запрошені (не лише ті, хто прийняв), кожен зі своїм статусом
    # інвайту — фронт показує це як бейджі "прийнято"/"очікування" тощо
    # і сам відфільтровує accepted/arrived для виділення на карті.
    participants = serializers.SerializerMethodField()

    def get_participants(self, obj):
        invitations = obj.invitations.select_related('to_user').order_by('created_at')
        return ActivityParticipantSerializer(invitations, many=True).data

    class Meta:
        model = Activity
        fields = [
            'id', 'creator', 'title', 'description',
            'latitude', 'longitude', 'started_at', 'category', 'created_at',
            'live_status', 'geofence_radius_m', 'activated_at', 'completed_at',
            'participant_ids', 'participants',
        ]
        read_only_fields = [
            'id', 'creator', 'created_at', 'started_at',
            'live_status', 'activated_at', 'completed_at',
        ]

    def validate_latitude(self, value):
        if not -90.0 <= value <= 90.0:
            raise serializers.ValidationError("Широта повинна бути в діапазоні від -90 до 90.")
        return value

    def validate_longitude(self, value):
        if not -180.0 <= value <= 180.0:
            raise serializers.ValidationError("Довгота повинна бути в діапазоні від -180 до 180.")
        return value

    def validate_participant_ids(self, value):
        request = self.context['request']

        if request.user in value:
            raise serializers.ValidationError(
                "Не можна запросити самого себе — ви й так учасник як creator."
            )

        if len(value) > self.MAX_PARTICIPANTS:
            raise serializers.ValidationError(
                f"Максимум {self.MAX_PARTICIPANTS} учасників на одну активність."
            )

        if len(set(u.pk for u in value)) != len(value):
            raise serializers.ValidationError(
                "У списку учасників є повтори."
            )

        return value

    def validate(self, attrs):
        # Перевірка на випадок PATCH-запитів: координати мають передаватися парою
        lat = attrs.get('latitude')
        lng = attrs.get('longitude')
        if (lat is None) != (lng is None):
            raise serializers.ValidationError(
                "Потрібно передати одночасно і latitude, і longitude або взагалі не передавати координати."
            )
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['latitude'] = instance.point.y
        data['longitude'] = instance.point.x
        return data

    @transaction.atomic  # Гарантуємо цілісність даних при створенні активності та інвайтів
    def create(self, validated_data):
        lat = validated_data.pop('latitude')
        lng = validated_data.pop('longitude')
        participants = validated_data.pop('participant_ids')

        now = timezone.now()
        validated_data['point'] = Point(lng, lat, srid=4326)
        validated_data['creator'] = self.context['request'].user
        # Активність стартує одразу в момент створення — не чекаємо,
        # поки хтось із запрошених прийме інвайт.
        validated_data['started_at'] = now
        validated_data['live_status'] = Activity.LiveStatus.ACTIVE
        validated_data['activated_at'] = now

        activity = Activity.objects.create(**validated_data)

        # Створюємо інвайти
        Invitation.objects.bulk_create([
            Invitation(
                from_user=activity.creator,
                to_user=user,
                activity=activity,
            )
            for user in participants
        ])

        # Real-time WebSocket: notify each invited participant
        try:
            from api.consumers import notify_user
            from apps.users.models import FriendRequest
            for user in participants:
                fr_count = FriendRequest.objects.filter(to_user=user).count()
                inv_count = Invitation.objects.filter(to_user=user, status=Invitation.Status.PENDING).count()
                notify_user(user.pk, fr_count + inv_count)
        except Exception:
            pass

        return activity

    def update(self, instance, validated_data):
        validated_data.pop('participant_ids', None)

        lat = validated_data.pop('latitude', None)
        lng = validated_data.pop('longitude', None)
        if lat is not None and lng is not None:
            instance.point = Point(lng, lat, srid=4326)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class ActivityListSerializer(ActivitySerializer):
    """Для списку/пошуку поруч — додає відстань, якщо вона була проанотована у queryset"""
    distance_km = serializers.SerializerMethodField()

    class Meta(ActivitySerializer.Meta):
        fields = ActivitySerializer.Meta.fields + ['distance_km']

    def get_distance_km(self, obj):
        distance = getattr(obj, 'distance', None)
        return round(distance.km, 2) if distance is not None else None


class InvitationSerializer(serializers.ModelSerializer):
    """
    Читання: повні дані from_user/to_user/activity.
    Створення: from_user береться з request.user, to_user/activity — по id.
    """
    from_user = UserPublicSerializer(read_only=True)
    to_user = UserPublicSerializer(read_only=True)
    to_user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='to_user', write_only=True
    )
    activity_id = serializers.PrimaryKeyRelatedField(
        queryset=Activity.objects.all(), source='activity', write_only=True
    )

    class Meta:
        model = Invitation
        fields = [
            'id', 'from_user', 'to_user', 'to_user_id',
            'activity', 'activity_id', 'status', 'created_at',
        ]
        read_only_fields = ['id', 'from_user', 'activity', 'status', 'created_at']

    def validate(self, attrs):
        from_user = self.context['request'].user
        to_user = attrs.get('to_user')
        activity = attrs.get('activity')

        if from_user == to_user:
            raise serializers.ValidationError("Не можна відправити запрошення самому собі.")

        if activity.creator == to_user:
            raise serializers.ValidationError("Цей користувач є автором активності й вже бере участь у ній.")

        # Запобігаємо помилці унікальності унікального констрейнту на рівні БД
        if Invitation.objects.filter(from_user=from_user, to_user=to_user, activity=activity).exists():
            raise serializers.ValidationError("Запрошення для цього користувача на цю активність вже надіслано.")

        return attrs

    def create(self, validated_data):
        validated_data['from_user'] = self.context['request'].user
        return Invitation.objects.create(**validated_data)


class InvitationRespondSerializer(serializers.ModelSerializer):
    """Отримувач запрошення може лише прийняти або відхилити"""

    class Meta:
        model = Invitation
        fields = ['status']

    def validate_status(self, value):
        allowed = [Invitation.Status.ACCEPTED, Invitation.Status.DECLINED]
        if value not in allowed:
            raise serializers.ValidationError(
                "Статус можна змінити лише на 'accepted' або 'declined'"
            )
        return value

    def update(self, instance, validated_data):
        # ВИПРАВЛЕНО: викликаємо бізнес-методи моделі, щоб спрацювала вся логіка сесій
        status = validated_data.get('status')
        if status == Invitation.Status.ACCEPTED:
            instance.accept()  # Внутрішній метод активує сесію та оновить responded_at
        elif status == Invitation.Status.DECLINED:
            instance.decline()  # Оновить responded_at

        # Real-time WebSocket: notify activity participants about status change
        try:
            from api.consumers import notify_activity_participants, notify_user
            from apps.users.models import FriendRequest

            participant = {
                'id': instance.to_user.id,
                'username': instance.to_user.username,
                'status': instance.status,
            }
            notify_activity_participants(instance.activity_id, participant, instance.activity.live_status)

            # Also update notification count for the activity creator
            fr_count = FriendRequest.objects.filter(to_user=instance.activity.creator).count()
            inv_count = Invitation.objects.filter(
                to_user=instance.activity.creator,
                status=Invitation.Status.PENDING,
            ).count()
            notify_user(instance.activity.creator_id, fr_count + inv_count)
        except Exception:
            pass

        return instance