from django.db.models import Q
from rest_framework import mixins, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Invitation
from ..permissions import IsInvitationReceiver
from ..serializers import InvitationRespondSerializer, InvitationSerializer


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
