from django.contrib.gis.geos import Point
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
        point = Point(lng, lat, srid=4326)  # увага: X=longitude, Y=latitude
        user = self.context['request'].user
        location, _ = Location.objects.update_or_create(
            user=user, defaults={'point': point}
        )
        return location


class ActivitySerializer(serializers.ModelSerializer):
    """Створення/редагування/детальний перегляд однієї активності"""
    creator = UserPublicSerializer(read_only=True)
    latitude = serializers.FloatField(write_only=True)
    longitude = serializers.FloatField(write_only=True)

    class Meta:
        model = Activity
        fields = [
            'id', 'creator', 'title', 'description',
            'latitude', 'longitude', 'started_at', 'category', 'created_at',
        ]
        read_only_fields = ['id', 'creator', 'created_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['latitude'] = instance.point.y
        data['longitude'] = instance.point.x
        return data

    def create(self, validated_data):
        lat = validated_data.pop('latitude')
        lng = validated_data.pop('longitude')
        validated_data['point'] = Point(lng, lat, srid=4326)
        validated_data['creator'] = self.context['request'].user
        return Activity.objects.create(**validated_data)

    def update(self, instance, validated_data):
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