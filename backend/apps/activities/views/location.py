from typing import Any

from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.users.serializers import UserPublicSerializer
from apps.users.models import Block
from ..models import Activity, HiddenActivity, Invitation, Location
from ..permissions import IsCreatorOrReadOnly
from ..serializers import ActivityListSerializer, ActivitySerializer, LocationSerializer


class LocationViewSet(mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Позиція поточного користувача: створення/оновлення без доступу до чужих записів."""
    serializer_class = LocationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Location.objects.filter(user=self.request.user)

    def get_object(self):
        obj, _ = Location.objects.get_or_create(user=self.request.user)
        return obj

    def create(self, request, *args: Any, **kwargs: Any):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(self.get_serializer(instance).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args: Any, **kwargs: Any):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self.get_serializer(instance).data)

    @action(detail=False, methods=['get'], url_path='nearby')
    def nearby(self, request):
        """Повертає користувачів поруч, які мають карту увімкненою."""
        try:
            lat = float(request.query_params['lat'])
            lng = float(request.query_params['lng'])
            radius_km = float(request.query_params.get('radius', 5))
        except (KeyError, ValueError):
            return Response(
                {'detail': 'Потрібні числові параметри lat, lng (radius — опційний, км)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        my_point = Point(lng, lat, srid=4326)

        blocked_ids = Block.objects.filter(blocker=request.user).values_list('blocked_id', flat=True)
        blocked_by_ids = Block.objects.filter(blocked=request.user).values_list('blocker_id', flat=True)
        excluded_ids = set(blocked_ids) | set(blocked_by_ids)

        locations = (
            Location.objects.filter(
                user__is_visible_on_map=True,
                point__distance_lte=(my_point, D(km=radius_km)),
            )
            .exclude(user=request.user)
            .exclude(user_id__in=excluded_ids)
            .select_related('user')
        )

        data = [
            {
                **UserPublicSerializer(loc.user).data,
                'latitude': loc.point.y,
                'longitude': loc.point.x,
                'is_online': loc.is_online(),
            }
            for loc in locations
        ]
        return Response(data)
