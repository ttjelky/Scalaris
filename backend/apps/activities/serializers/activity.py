from django.contrib.gis.geos import Point
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.users.models import User
from apps.users.serializers import UserPublicSerializer
from ..models import Activity, Checkpoint, Invitation, ParticipantCheckpoint


class ActivityParticipantSerializer(serializers.ModelSerializer):
    """
    Один запрошений на активність, сплющено в {..user fields.., status} —
    зручно рендерити як список чіпів "ім'я + бейдж статусу" на фронті.
    """
    passed_checkpoints = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = ['status', 'passed_checkpoints']

    def get_passed_checkpoints(self, obj):
        return list(
            obj.passed_checkpoints.values_list('checkpoint_id', flat=True)
        )

    def to_representation(self, instance):
        data = UserPublicSerializer(instance.to_user).data
        data['status'] = instance.status
        data['passed_checkpoints'] = self.get_passed_checkpoints(instance)
        return data


class CheckpointWriteSerializer(serializers.Serializer):
    """Один чекпоїнт при створенні кросу."""
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    order = serializers.IntegerField(min_value=1)
    radius_m = serializers.IntegerField(min_value=5, max_value=200, default=30)


class CheckpointReadSerializer(serializers.ModelSerializer):
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()

    class Meta:
        model = Checkpoint
        fields = ['id', 'order', 'latitude', 'longitude', 'radius_m']

    def get_latitude(self, obj):
        return obj.point.y

    def get_longitude(self, obj):
        return obj.point.x


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
        required=False,
        allow_empty=True,
        help_text='Список id користувачів, яких запрошуємо. Максимум 8.'
    )
    checkpoints_data = CheckpointWriteSerializer(
        many=True,
        write_only=True,
        required=False,
        help_text='Список чекпоїнтів для кросу (category=cross).'
    )
    duration_seconds = serializers.IntegerField(
        required=False,
        min_value=30,
        max_value=86400,
        help_text='Тривалість кросу в секундах (30с – 24год).'
    )
    participants = serializers.SerializerMethodField()
    checkpoints = CheckpointReadSerializer(many=True, read_only=True)

    def get_participants(self, obj):
        invitations = obj.invitations.select_related('to_user').order_by('created_at')
        return ActivityParticipantSerializer(invitations, many=True).data

    class Meta:
        model = Activity
        fields = [
            'id', 'creator', 'title', 'description',
            'latitude', 'longitude', 'started_at', 'category', 'created_at',
            'live_status', 'geofence_radius_m', 'activated_at', 'completed_at',
            'participant_ids', 'participants', 'checkpoints',
            'checkpoints_data', 'duration_seconds', 'is_friends_only',
        ]
        read_only_fields = [
            'id', 'creator', 'created_at', 'started_at',
            'live_status', 'activated_at', 'completed_at', 'checkpoints',
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
        lat = attrs.get('latitude')
        lng = attrs.get('longitude')
        if (lat is None) != (lng is None):
            raise serializers.ValidationError(
                "Потрібно передати одночасно і latitude, і longitude або взагалі не передавати координати."
            )

        category = attrs.get('category')
        checkpoints_data = attrs.get('checkpoints_data')
        if category == Activity.Category.CROSS:
            if not checkpoints_data or len(checkpoints_data) < 2:
                raise serializers.ValidationError(
                    {"checkpoints_data": "Для кросу потрібно мінімум 2 чекпоїнти."}
                )
            duration = attrs.get('duration_seconds')
            if duration is None:
                raise serializers.ValidationError(
                    {"duration_seconds": "Для кросу тривалість обов'язкова."}
                )
            if duration < 30:
                raise serializers.ValidationError(
                    {"duration_seconds": "Мінімальна тривалість — 30 секунд."}
                )
            orders = [cp['order'] for cp in checkpoints_data]
            if sorted(orders) != list(range(1, len(orders) + 1)):
                raise serializers.ValidationError(
                    {"checkpoints_data": "Порядок чекпоїнтів має бути послідовним: 1, 2, 3 …"}
                )

        if category == Activity.Category.ZONE:
            participants = attrs.get('participant_ids', [])
            if participants:
                raise serializers.ValidationError(
                    {"participant_ids": "У ігрову зону не можна запрошувати учасників — оберіть видимість (is_friends_only) замість цього."}
                )

        if category and category != Activity.Category.ZONE:
            participants = attrs.get('participant_ids', [])
            if not participants:
                raise serializers.ValidationError(
                    {"participant_ids": "Потрібно запросити хоча б одного учасника."}
                )
            if len(participants) > self.MAX_PARTICIPANTS:
                raise serializers.ValidationError(
                    {"participant_ids": f"Максимум {self.MAX_PARTICIPANTS} учасників на одну активність."}
                )

        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['latitude'] = instance.point.y
        data['longitude'] = instance.point.x
        return data

    @transaction.atomic
    def create(self, validated_data):
        lat = validated_data.pop('latitude')
        lng = validated_data.pop('longitude')
        participants = validated_data.pop('participant_ids', [])
        checkpoints_data = validated_data.pop('checkpoints_data', [])

        now = timezone.now()
        validated_data['point'] = Point(lng, lat, srid=4326)
        validated_data['creator'] = self.context['request'].user
        validated_data['started_at'] = now
        validated_data['live_status'] = Activity.LiveStatus.ACTIVE
        validated_data['activated_at'] = now

        activity = Activity.objects.create(**validated_data)

        Invitation.objects.bulk_create([
            Invitation(
                from_user=activity.creator,
                to_user=user,
                activity=activity,
            )
            for user in participants
        ])

        if activity.category == Activity.Category.CROSS and checkpoints_data:
            Checkpoint.objects.bulk_create([
                Checkpoint(
                    activity=activity,
                    order=cp['order'],
                    point=Point(cp['longitude'], cp['latitude'], srid=4326),
                    radius_m=cp.get('radius_m', 30),
                )
                for cp in checkpoints_data
            ])

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
