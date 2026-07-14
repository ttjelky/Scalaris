from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.serializers import UserPublicSerializer
from .models import Activity, Invitation, Location
from .serializers import (
    ActivityListSerializer,
    ActivitySerializer,
    InvitationRespondSerializer,
    InvitationSerializer,
    LocationSerializer,
)


class LocationUpdateView(generics.CreateAPIView):
    """POST — клієнт шле сюди свою позицію періодично (пінг). Завжди upsert для поточного юзера."""
    serializer_class = LocationSerializer
    permission_classes = [permissions.IsAuthenticated]


class NearbyUsersView(APIView):
    """GET ?lat=&lng=&radius= — хто видимий на карті поруч"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
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


class ActivityListCreateView(generics.ListCreateAPIView):
    """
    GET  — список активностей. Якщо передані ?lat=&lng= — фільтр по радіусу і сортування по відстані.
    POST — створити нову активність (creator = поточний юзер).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        return ActivitySerializer if self.request.method == 'POST' else ActivityListSerializer

    def get_queryset(self):
        qs = Activity.objects.select_related('creator')
        lat = self.request.query_params.get('lat')
        lng = self.request.query_params.get('lng')

        if lat and lng:
            radius_km = float(self.request.query_params.get('radius', 10))
            my_point = Point(float(lng), float(lat), srid=4326)
            qs = (
                qs.filter(point__distance_lte=(my_point, D(km=radius_km)))
                .annotate(distance=Distance('point', my_point))
                .order_by('distance')
            )
        return qs


class ActivityDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE — редагувати чи видаляти може лише творець активності"""
    queryset = Activity.objects.select_related('creator')
    serializer_class = ActivitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_update(self, serializer):
        if serializer.instance.creator != self.request.user:
            raise PermissionDenied('Редагувати активність може лише її автор')
        serializer.save()

    def perform_destroy(self, instance):
        if instance.creator != self.request.user:
            raise PermissionDenied('Видаляти активність може лише її автор')
        instance.delete()


class InvitationListCreateView(generics.ListCreateAPIView):
    """
    GET  ?direction=received|sent — вхідні (за замовч.) або надіслані запрошення.
    POST — надіслати запрошення (from_user = поточний юзер).
    """
    serializer_class = InvitationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        direction = self.request.query_params.get('direction', 'received')
        base = Invitation.objects.select_related('from_user', 'to_user', 'activity')
        if direction == 'sent':
            return base.filter(from_user=user)
        return base.filter(to_user=user)


class InvitationRespondView(generics.UpdateAPIView):
    """PATCH — прийняти або відхилити запрошення. Доступно лише отримувачу."""
    serializer_class = InvitationRespondSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Invitation.objects.filter(to_user=self.request.user)