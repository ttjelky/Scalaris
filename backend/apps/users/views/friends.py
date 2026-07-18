from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.consumers import notify_user
from ..models import Block, FriendRequest, User
from ..serializers import FriendRequestSerializer, UserPublicSerializer


class SendFriendRequestView(APIView):
    """POST /api/users/<pk>/friend-request/ — надіслати запит у друзі."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if pk == request.user.pk:
            return Response(
                {'detail': 'Не можна надіслати запит у друзі самому собі.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target = get_object_or_404(User, pk=pk)

        # Перевірка на блокування
        if Block.objects.filter(blocker=target, blocked=request.user).exists():
            return Response(
                {'detail': 'Ви не можете надіслати запит цьому користувачу.'},
                status=status.HTTP_403_FORBIDDEN
            )
        if Block.objects.filter(blocker=request.user, blocked=target).exists():
            return Response(
                {'detail': 'Ви заблокували цього користувача. Розблокуйте його перед тим як додавати у друзі.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Перевірка чи не є вони вже друзями
        if request.user.friends.filter(pk=pk).exists():
            return Response(
                {'detail': 'Ви вже друзі.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Якщо інший користувач уже надіслав запит — приймаємо автоматично
        incoming = FriendRequest.objects.filter(from_user=target, to_user=request.user).first()
        if incoming:
            request.user.friends.add(target)
            incoming.delete()
            FriendRequest.objects.filter(from_user=request.user, to_user=target).delete()
            return Response(
                {'detail': 'Запит прийнято!', 'friendship_status': 'friends'},
                status=status.HTTP_200_OK,
            )

        friend_request, created = FriendRequest.objects.get_or_create(
            from_user=request.user,
            to_user=target,
        )
        payload = {
            'detail': 'Запит надіслано!' if created else 'Запит уже надіслано.',
            'friend_request_id': friend_request.id,
            'friendship_status': 'request_sent',
        }

        # Real-time notification via WebSocket
        try:
            from apps.activities.models import Invitation
            fr_count = FriendRequest.objects.filter(to_user=target).count()
            inv_count = Invitation.objects.filter(to_user=target, status='pending').count()
            notify_user(target.pk, fr_count + inv_count)
        except Exception:
            pass

        return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class AcceptFriendRequestView(APIView):
    """POST /api/friend-requests/<pk>/accept/ — прийняти запит (pk - ID запиту)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        friend_request = get_object_or_404(FriendRequest, pk=pk, to_user=request.user)
        from_user = friend_request.from_user

        # Додаємо один одного в друзі
        request.user.friends.add(from_user)

        # Видаляємо виконаний запит
        friend_request.delete()

        # Видаляємо зустрічний запит, якщо такий випадково є
        FriendRequest.objects.filter(from_user=request.user, to_user=from_user).delete()

        # Real-time notification: update both users' notification counts
        try:
            from apps.activities.models import Invitation
            # Notify the original sender (their request was accepted → count decreases)
            fr_count = FriendRequest.objects.filter(to_user=from_user).count()
            inv_count = Invitation.objects.filter(to_user=from_user, status='pending').count()
            notify_user(from_user.pk, fr_count + inv_count)
            # Notify the accepting user too (their received requests changed)
            fr_count_me = FriendRequest.objects.filter(to_user=request.user).count()
            inv_count_me = Invitation.objects.filter(to_user=request.user, status='pending').count()
            notify_user(request.user.pk, fr_count_me + inv_count_me)
        except Exception:
            pass

        return Response({'detail': 'Запит прийнято!'}, status=status.HTTP_200_OK)


class RejectFriendRequestView(APIView):
    """DELETE /api/friend-requests/<pk>/reject/ — відхилити/скасувати запит (pk - ID запиту)."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        # Дозволяємо видалити запит як тому, хто отримав, так і тому, хто надіслав
        friend_request = get_object_or_404(
            FriendRequest,
            Q(to_user=request.user) | Q(from_user=request.user),
            pk=pk
        )

        # Determine which user to notify (the one who didn't trigger the delete)
        other_user = friend_request.from_user if friend_request.to_user == request.user else friend_request.to_user

        friend_request.delete()

        # Real-time notification
        try:
            from apps.activities.models import Invitation
            fr_count = FriendRequest.objects.filter(to_user=other_user).count()
            inv_count = Invitation.objects.filter(to_user=other_user, status='pending').count()
            notify_user(other_user.pk, fr_count + inv_count)
        except Exception:
            pass

        return Response(status=status.HTTP_204_NO_CONTENT)


class RemoveFriendView(APIView):
    """DELETE /api/users/<pk>/friend/ — видалити з друзів (pk - ID юзера)."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        request.user.friends.remove(target)
        return Response(status=status.HTTP_204_NO_CONTENT)


class FriendsListView(generics.ListAPIView):
    """GET /api/me/friends/ — мої друзі."""
    serializer_class = UserPublicSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.request.user.friends.all()


class SentFriendRequestsView(generics.ListAPIView):
    """GET /api/me/friend-requests/sent/ — надіслані мною запити."""
    serializer_class = FriendRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.request.user.sent_friend_requests.select_related('to_user').all()


class ReceivedFriendRequestsView(generics.ListAPIView):
    """GET /api/me/friend-requests/received/ — вхідні запити."""
    serializer_class = FriendRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.request.user.received_friend_requests.select_related('from_user').all()
