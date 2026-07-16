from typing import Any

from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db.models import Q
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.users.serializers import UserPublicSerializer
from .models import Activity, Invitation, Location
from .permissions import IsCreatorOrReadOnly, IsInvitationReceiver
from .serializers import (
    ActivityListSerializer,
    ActivitySerializer,
    InvitationRespondSerializer,
    InvitationSerializer,
    LocationSerializer,
)


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
        locations = (
            Location.objects.filter(
                user__is_visible_on_map=True,
                point__distance_lte=(my_point, D(km=radius_km)),
            )
            .exclude(user=request.user)
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


class ActivityViewSet(viewsets.ModelViewSet):
    """CRUD для активностей із оптимізованим запитом до creator та пошуком поруч."""
    serializer_class = ActivitySerializer
    permission_classes = [permissions.IsAuthenticated, IsCreatorOrReadOnly]

    def get_queryset(self):
        return Activity.objects.select_related('creator').all()

    def perform_create(self, serializer):
        serializer.save(creator=self.request.user)

    @action(detail=False, methods=['get'], url_path='near-me')
    def near_me(self, request):
        """Повертає активності поруч, відсортовані за відстанню."""
        try:
            lat = float(request.query_params['lat'])
            lng = float(request.query_params['lng'])
            radius_km = float(request.query_params.get('radius', 5))
        except (KeyError, ValueError):
            return Response(
                {'detail': 'Потрібні числові параметри lat, lng (radius — опційний, км)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        point = Point(lng, lat, srid=4326)
        queryset = (
            self.get_queryset()
            .filter(point__distance_lte=(point, D(km=radius_km)))
            .annotate(distance=Distance('point', point))
            .order_by('distance')
        )
        serializer = ActivityListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


class InvitationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Список і перегляд запрошень, де поточний юзер є відправником або отримувачем."""
    serializer_class = InvitationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return (
            Invitation.objects.select_related('from_user', 'to_user', 'activity')
            .filter(Q(from_user=user) | Q(to_user=user))
            .order_by('-created_at')
        )

    @action(detail=True, methods=['patch'], permission_classes=[IsInvitationReceiver], url_path='respond')
    def respond(self, request, pk=None):
        """Оновлює статус запрошення на accepted/declined."""
        invitation = self.get_object()
        serializer = InvitationRespondSerializer(
            invitation,
            data=request.data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(InvitationSerializer(invitation, context={'request': request}).data)