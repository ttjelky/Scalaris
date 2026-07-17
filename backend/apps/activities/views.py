from typing import Any

from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db.models import Q
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.users.serializers import UserPublicSerializer
from apps.users.models import Block
from .models import Activity, Invitation, Location, Checkpoint, ParticipantCheckpoint
from .permissions import IsCreatorOrReadOnly, IsInvitationReceiver
from .serializers import (
    ActivityListSerializer,
    ActivitySerializer,
    InvitationRespondSerializer,
    InvitationSerializer,
    LocationSerializer,
    CheckpointReadSerializer,
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

        # Hide anyone I've blocked, and anyone who's blocked me — mutual,
        # like the button in the profile says ("ви перестанете бачити
        # одне одного"), not one-directional.
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


class ActivityViewSet(viewsets.ModelViewSet):
    """CRUD для активностей із оптимізованим запитом до creator та пошуком поруч."""
    serializer_class = ActivitySerializer
    permission_classes = [permissions.IsAuthenticated, IsCreatorOrReadOnly]

    def get_queryset(self):
        return Activity.objects.select_related('creator').all()

    def perform_create(self, serializer):
        serializer.save(creator=self.request.user)

    @action(detail=False, methods=['get'], url_path='my-active')
    def my_active(self, request):
        """
        Активний (live) збір поточного користувача, якщо є — фронт викликає
        це при завантаженні сторінки, щоб не втрачати ongoing-стан після
        перезавантаження (React-стейт сам по собі не переживає reload).
        Шукаємо як серед створених користувачем активностей, так і серед
        тих, де він прийняв запрошення (accepted/arrived).
        """
        user = request.user
        active_status = Activity.LiveStatus.ACTIVE

        # Activities where user is the creator
        creator_qs = Activity.objects.filter(creator=user, live_status=active_status)

        # Activities where user accepted/arrived via invitation
        invited_qs = Activity.objects.filter(
            invitations__to_user=user,
            invitations__status__in=[Invitation.Status.ACCEPTED, Invitation.Status.ARRIVED],
            live_status=active_status,
        )

        activity = (
            Activity.objects.filter(Q(pk__in=creator_qs) | Q(pk__in=invited_qs))
            .select_related('creator')
            .order_by('-started_at')
            .first()
        )
        if activity is None:
            return Response(None)
        serializer = self.get_serializer(activity)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='leave')
    def leave(self, request, pk=None):
        """Творець достроково завершує свій live-збір (кнопка «Вийти» на фронті)."""
        activity = self.get_object()
        activity.cancel()
        serializer = self.get_serializer(activity)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='checkpoints/(?P<checkpoint_id>[\\d]+)/pass')
    def pass_checkpoint(self, request, pk=None, checkpoint_id=None):
        """Учасник позначає, що пройшов чекпоїнт."""
        activity = self.get_object()
        try:
            checkpoint = activity.checkpoints.get(pk=checkpoint_id)
        except Checkpoint.DoesNotExist:
            return Response(
                {'detail': 'Чекпоїнт не знайдено.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Знаходимо інвайт поточного користувача в цій активності
        try:
            invitation = activity.invitations.get(to_user=request.user)
        except Invitation.DoesNotExist:
            return Response(
                {'detail': 'Ви не є учасником цієї активності.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Створюємо запис про проходження (або повертаємо існуючий)
        participant_cp, created = ParticipantCheckpoint.objects.get_or_create(
            invitation=invitation,
            checkpoint=checkpoint,
        )

        return Response({
            'checkpoint_id': checkpoint.id,
            'order': checkpoint.order,
            'passed': True,
            'created': created,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='checkpoints/progress')
    def checkpoints_progress(self, request, pk=None):
        """Повертає прогрес учасника по чекпоїнтах."""
        activity = self.get_object()

        try:
            invitation = activity.invitations.get(to_user=request.user)
        except Invitation.DoesNotExist:
            # Якщо користувач — creator, шукаємо по invitation з from_user
            return Response({
                'total': activity.checkpoints.count(),
                'passed': [],
                'current': 1,
            })

        passed_ids = list(
            invitation.passed_checkpoints.values_list('checkpoint_id', flat=True)
        )
        total = activity.checkpoints.count()
        current = len(passed_ids) + 1

        return Response({
            'total': total,
            'passed': passed_ids,
            'current': min(current, total),
        })

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