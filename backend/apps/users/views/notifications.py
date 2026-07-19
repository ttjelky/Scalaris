from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import FriendRequest
from ..serializers import UserPublicSerializer


class NotificationsView(APIView):
    """GET /api/users/me/notifications/ — об'єднаний список сповіщень:
    вхідні запити у друзі + запрошення на активності (status=pending).
    Повертає єдиний формат: { id, type, from_user, created_at, activity?, detail? }
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.activities.models import Invitation

        notifications = []

        friend_requests = FriendRequest.objects.filter(
            to_user=request.user
        ).select_related('from_user').order_by('-created_at')

        for fr in friend_requests:
            notifications.append({
                'id': f'friend_request_{fr.id}',
                'type': 'friend_request',
                'from_user': UserPublicSerializer(fr.from_user, context={'request': request}).data,
                'created_at': fr.created_at.isoformat(),
                'activity': None,
            })

        invitations = Invitation.objects.filter(
            to_user=request.user,
            status=Invitation.Status.PENDING,
        ).select_related('from_user', 'activity', 'activity__creator').order_by('-created_at')

        for inv in invitations:
            notifications.append({
                'id': f'invitation_{inv.id}',
                'type': 'activity_invitation',
                'from_user': UserPublicSerializer(inv.from_user, context={'request': request}).data,
                'created_at': inv.created_at.isoformat(),
                'activity': {
                    'id': inv.activity.id,
                    'title': inv.activity.title,
                    'category': inv.activity.category,
                    'started_at': inv.activity.started_at.isoformat(),
                    'latitude': inv.activity.point.y,
                    'longitude': inv.activity.point.x,
                },
            })

        notifications.sort(key=lambda n: n['created_at'], reverse=True)

        return Response(notifications)


class NotificationsCountView(APIView):
    """GET /api/users/me/notifications/count/ — кількість непрочитаних сповіщень."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.activities.models import Invitation

        friend_request_count = FriendRequest.objects.filter(to_user=request.user).count()
        invitation_count = Invitation.objects.filter(
            to_user=request.user,
            status=Invitation.Status.PENDING,
        ).count()

        return Response({
            'count': friend_request_count + invitation_count,
        })
