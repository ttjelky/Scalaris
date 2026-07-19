from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Block, Report, User
from ..serializers import ReportSerializer, UserPublicSerializer


class BlockView(APIView):
    """Block or unblock another user. POST to block, DELETE to unblock.

    Blocking is mutual and symmetric: a blocked pair stops seeing each other
    on the map in both directions (enforced in the nearby queries), and each
    can unblock the other independently — the relationship is a single row
    keyed by (blocker, blocked), so there's no "who blocked whom" state to
    get out of sync."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk=None):
        if pk is not None and int(pk) == request.user.pk:
            return Response(
                {'detail': 'Не можна заблокувати самого себе.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        blocked_user = get_object_or_404(User, pk=pk)
        _, created = Block.objects.get_or_create(
            blocker=request.user, blocked=blocked_user
        )
        if not created:
            return Response(
                {'detail': 'Користувача вже заблоковано.'},
                status=status.HTTP_200_OK,
            )
        return Response(status=status.HTTP_201_CREATED)

    def delete(self, request, pk=None):
        if pk is not None and int(pk) == request.user.pk:
            return Response(
                {'detail': 'Не можна розблокувати самого себе.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        blocked_user = get_object_or_404(User, pk=pk)
        deleted, _ = Block.objects.filter(
            blocker=request.user, blocked=blocked_user
        ).delete()
        if not deleted:
            return Response(
                {'detail': 'Користувача не було у списку заблокованих.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class BlockedUsersListView(generics.ListAPIView):
    """GET /api/users/blocked/"""
    serializer_class = UserPublicSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        blocked_ids = Block.objects.filter(blocker=self.request.user).values_list('blocked_id', flat=True)
        return User.objects.filter(pk__in=blocked_ids)


class ReportUserView(APIView):
    """POST — поскаржитись на юзера (причина + опційні деталі)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if pk == request.user.pk:
            return Response(
                {'detail': 'Не можна поскаржитись на самого себе.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = get_object_or_404(User, pk=pk)
        serializer = ReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        Report.objects.create(reporter=request.user, reported=target, **serializer.validated_data)
        return Response({'detail': 'Дякуємо, скаргу надіслано.'}, status=status.HTTP_201_CREATED)
