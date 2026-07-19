from django.contrib.gis.geos import Point
from rest_framework import serializers

from ..models import Location


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

    def update(self, instance, validated_data):
        lat = validated_data.pop('latitude', None)
        lng = validated_data.pop('longitude', None)
        if lat is not None and lng is not None:
            instance.point = Point(lng, lat, srid=4326)
        instance.save()
        return instance
