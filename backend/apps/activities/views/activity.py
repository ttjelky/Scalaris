from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.users.serializers import UserPublicSerializer
from ..models import Activity, HiddenActivity, Invitation, Location, ParticipantCheckpoint
from ..permissions import IsCreatorOrReadOnly
from ..serializers import ActivityListSerializer, ActivitySerializer


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
        user = request.user
        active_status = Activity.LiveStatus.ACTIVE

        creator_qs = Activity.objects.filter(creator=user, live_status=active_status)
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
        activity = self.get_object()
        if activity.category != Activity.Category.ZONE:
            activity.cancel()
        serializer = self.get_serializer(activity)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        activity = self.get_object()
        activity_id = activity.pk
        activity.delete()

        try:
            from api.consumers import notify_zone_deleted
            notify_zone_deleted(activity_id)
        except Exception:
            pass

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='hide')
    def hide(self, request, pk=None):
        """Приховати ігрову зону для поточного користувача назавжди."""
        activity = self.get_object()
        if activity.category != Activity.Category.ZONE:
            return Response(
                {'detail': 'Можна приховати лише ігрові зони.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        HiddenActivity.objects.get_or_create(
            user=request.user,
            activity=activity,
        )
        return Response({'detail': 'Зону приховано.'}, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=['post'],
        url_path='checkpoints/(?P<checkpoint_id>[\\d]+)/pass',
        permission_classes=[permissions.IsAuthenticated],
    )
    def pass_checkpoint(self, request, pk=None, checkpoint_id=None):
        activity = self.get_object()
        try:
            checkpoint = activity.checkpoints.get(pk=checkpoint_id)
        except Exception:
            return Response(
                {'detail': 'Чекпоїнт не знайдено.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            invitation = activity.invitations.get(to_user=request.user)
        except Invitation.DoesNotExist:
            return Response(
                {'detail': 'Ви не є учасником цієї активності.'},
                status=status.HTTP_403_FORBIDDEN,
            )

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
        activity = self.get_object()

        try:
            invitation = activity.invitations.get(to_user=request.user)
        except Invitation.DoesNotExist:
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

    @action(detail=False, methods=['get'], url_path='zones/nearby')
    def nearby_zones(self, request):
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

        friend_ids = set(request.user.friends.values_list('pk', flat=True))
        friend_ids.add(request.user.pk)
        hidden_ids = set(
            HiddenActivity.objects.filter(user=request.user).values_list('activity_id', flat=True)
        )

        zones = (
            Activity.objects.filter(
                category=Activity.Category.ZONE,
                live_status__in=[Activity.LiveStatus.ACTIVE, Activity.LiveStatus.PENDING],
                point__distance_lte=(point, D(km=radius_km)),
            )
            .exclude(pk__in=hidden_ids)
            .select_related('creator')
            .prefetch_related('invitations__to_user')
        )

        data = []
        for zone in zones:
            if zone.is_friends_only and zone.creator_id not in friend_ids:
                continue

            participants = [
                {
                    'id': inv.to_user.pk,
                    'username': inv.to_user.username,
                    'avatar': inv.to_user.avatar.url if inv.to_user.avatar else None,
                    'status': inv.status,
                }
                for inv in zone.invitations.all()
            ]
            data.append({
                'id': zone.pk,
                'title': zone.title,
                'description': zone.description,
                'latitude': zone.point.y,
                'longitude': zone.point.x,
                'radius': zone.geofence_radius_m,
                'is_friends_only': zone.is_friends_only,
                'creator': UserPublicSerializer(zone.creator).data,
                'participants': participants,
                'created_at': zone.created_at.isoformat(),
            })

        return Response({'zones': data, 'hidden_ids': list(hidden_ids)})
