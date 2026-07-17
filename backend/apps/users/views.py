import hashlib
from datetime import timedelta

import requests
from django.conf import settings
from django.db.models import Q
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken, Token

from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie
from .models import Block, FriendRequest, Report, TelegramLinkCode, User
from .serializers import (
    FriendRequestSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetSerializer,
    RegisterSerializer,
    ReportSerializer,
    UserPublicSerializer,
    UserSerializer,
)


class PasswordResetToken(Token):
    """Custom JWT token for password resets with 1-hour lifetime."""
    token_type = 'password-reset'
    lifetime = timedelta(hours=1)


def _password_fingerprint(user):
    """Short fingerprint of the user's current password hash.

    Embedded in every reset token and re-checked on confirm. Since
    `user.password` changes the moment the password is reset, this makes
    the token single-use for free: reusing an already-used (or since
    superseded) token will fail the fingerprint check even though the JWT
    signature itself is still technically valid until it expires.
    """
    return hashlib.sha256(user.password.encode()).hexdigest()[:16]


class RegisterRateThrottle(AnonRateThrottle):
    scope = 'register'


class PasswordResetRateThrottle(AnonRateThrottle):
    scope = 'password_reset'


class RegisterView(generics.CreateAPIView):
    # Explicitly skip authentication for this public endpoint. Without this,
    # DRF's DEFAULT_AUTHENTICATION_CLASSES (JWTAuthentication) still runs
    # first and will reject the request with 401 if the client happens to
    # send a stale/expired Authorization header — permission_classes =
    # [AllowAny] alone does NOT protect against that, since authentication
    # and permission checks are separate stages.
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegisterRateThrottle]


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class UserDetailView(generics.RetrieveAPIView):
    queryset = User.objects.all()
    serializer_class = UserPublicSerializer
    permission_classes = [permissions.IsAuthenticated]


class BlockUserView(APIView):
    """POST — заблокувати юзера (взаємно ховає одне одного на карті).
    DELETE — розблокувати."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if pk == request.user.pk:
            return Response(
                {'detail': 'Не можна заблокувати самого себе.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = get_object_or_404(User, pk=pk)
        Block.objects.get_or_create(blocker=request.user, blocked=target)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, pk):
        Block.objects.filter(blocker=request.user, blocked_id=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BlockedUsersListView(generics.ListAPIView):
    """GET — список юзерів, яких я заблокував."""
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


class LogoutView(APIView):
    """Blacklists the refresh token when present, then clears the cookie.

    This intentionally accepts anonymous requests so a stale/expired access
    token cannot block logout from the browser. The refresh cookie is still
    removed even when no valid token is available."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                pass  # already invalid/expired — fine, we're clearing the cookie anyway

        response = Response(status=status.HTTP_205_RESET_CONTENT)
        clear_refresh_cookie(response)
        return response


class PasswordResetView(APIView):
    """Initiate password reset: send a reset token (in dev, returned in response).

    Always returns the same 200 + generic message regardless of whether the
    email exists, so the endpoint can't be used to enumerate registered
    accounts (previously the serializer raised 400 for unknown emails,
    which leaked exactly that)."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        response_data = {
            'detail': 'Якщо акаунт з такою поштою існує, на неї надіслано лист для відновлення паролю.'
        }

        user = User.objects.filter(email__iexact=email).first()
        if user is not None:
            reset_token = PasswordResetToken.for_user(user)
            reset_token['email'] = str(user.email)
            reset_token['pwd_fp'] = _password_fingerprint(user)

            reset_link = f'{settings.FRONTEND_URL}/password-reset?token={reset_token}'

            send_mail(
                subject='Відновлення паролю',
                message=(
                    'Ви (або хтось інший) запросили відновлення паролю.\n\n'
                    f'Перейдіть за посиланням, щоб встановити новий пароль:\n{reset_link}\n\n'
                    'Посилання дійсне 1 годину і діє лише один раз. '
                    'Якщо ви не робили цей запит, просто проігноруйте лист.'
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )

            if settings.DEBUG:
                # Only expose the raw token in development so testing is easier.
                response_data['token'] = str(reset_token)

        return Response(response_data, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """Confirm password reset with token and new password."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token_str = serializer.validated_data['token']
        new_password = serializer.validated_data['password']

        try:
            reset_token = PasswordResetToken(token_str)
            user_id = reset_token['user_id']
        except TokenError as e:
            return Response(
                {'detail': f'Invalid or expired reset token: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Reject a token that's already been used (or superseded by a newer
        # reset request): the fingerprint only matches the password that
        # was current at the moment the token was issued.
        if reset_token.get('pwd_fp') != _password_fingerprint(user):
            return Response(
                {'detail': 'Invalid or expired reset token.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save()

        return Response(
            {'detail': 'Password has been reset successfully. You can now log in with your new password.'},
            status=status.HTTP_200_OK,
        )


class DiscordCallbackView(APIView):
    """POST {code} — фронтенд шле сюди код, який Discord повернув на
    redirect_uri. Ми міняємо його на access token (потребує CLIENT_SECRET,
    тому робиться тільки на бекенді, ніколи в браузері), тягнемо
    /users/@me і прив'язуємо discord_id до поточного юзера."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        code = request.data.get('code')
        redirect_uri = request.data.get('redirect_uri') or settings.DISCORD_REDIRECT_URI
        if not code:
            return Response({'detail': 'Відсутній code.'}, status=status.HTTP_400_BAD_REQUEST)

        token_resp = requests.post(
            'https://discord.com/api/oauth2/token',
            data={
                'client_id': settings.DISCORD_CLIENT_ID,
                'client_secret': settings.DISCORD_CLIENT_SECRET,
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': redirect_uri,
            },
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=10,
        )
        if not token_resp.ok:
            return Response(
                {'detail': 'Discord відхилив код авторизації. Спробуй підключити ще раз.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        access_token = token_resp.json().get('access_token')

        user_resp = requests.get(
            'https://discord.com/api/users/@me',
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=10,
        )
        if not user_resp.ok:
            return Response({'detail': 'Не вдалося отримати дані з Discord.'}, status=status.HTTP_400_BAD_REQUEST)
        discord_user = user_resp.json()

        # Той самий Discord-акаунт міг раніше бути прив'язаний до іншого
        # нашого юзера (наприклад, стара спроба) — тоді відв'язуємо звідти,
        # інакше впадемо на unique-constraint.
        User.objects.filter(discord_id=discord_user['id']).exclude(pk=request.user.pk).update(
            discord_id=None, discord_username=''
        )

        request.user.discord_id = discord_user['id']
        request.user.discord_username = discord_user.get('username', '')
        request.user.save(update_fields=['discord_id', 'discord_username'])

        return Response(UserSerializer(request.user, context={'request': request}).data)


class DiscordUnlinkView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        request.user.discord_id = None
        request.user.discord_username = ''
        request.user.save(update_fields=['discord_id', 'discord_username'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class TelegramLinkStartView(APIView):
    """POST — генерує одноразовий код і повертає посилання на бота.
    Фронтенд відкриває це посилання; юзер тисне /start в Telegram; окремий
    процес (management command telegram_bot) читає повідомлення бота,
    знаходить код і прив’язує telegram_id/telegram_username до юзера.
    Ніякого домену чи Login Widget тут не потрібно.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not settings.TELEGRAM_BOT_USERNAME:
            return Response(
                {'detail': 'Телеграм ще не налаштований (немає TELEGRAM_BOT_USERNAME).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        link_code = TelegramLinkCode.generate_for(request.user)
        return Response({
            'code': link_code.code,
            'bot_username': settings.TELEGRAM_BOT_USERNAME,
            'deep_link': f'https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={link_code.code}',
            'expires_in_minutes': TelegramLinkCode.LIFETIME_MINUTES,
        })


class TelegramUnlinkView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        request.user.telegram_id = None
        request.user.telegram_username = ''
        request.user.save(update_fields=['telegram_id', 'telegram_username'])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ==========================================
#          СИСТЕМА ДРУЗІВ (Нові Views)
# ==========================================

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
        return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class AcceptFriendRequestView(APIView):
    """POST /api/friend-requests/<pk>/accept/ — прийняти запит (pk - ID запиту)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        friend_request = get_object_or_404(FriendRequest, pk=pk, to_user=request.user)
        
        # Додаємо один одного в друзі
        request.user.friends.add(friend_request.from_user)
        
        # Видаляємо виконаний запит
        friend_request.delete()
        
        # Видаляємо зустрічний запит, якщо такий випадково є
        FriendRequest.objects.filter(from_user=request.user, to_user=friend_request.from_user).delete()
        
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
        friend_request.delete()
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


# ==========================================
#          СИСТЕМА СПОВІЩЕНЬ
# ==========================================

class NotificationsView(APIView):
    """GET /api/users/me/notifications/ — об'єднаний список сповіщень:
    вхідні запити у друзі + запрошення на активності (status=pending).
    Повертає єдиний формат: { id, type, from_user, created_at, activity?, detail? }
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.activities.models import Invitation

        notifications = []

        # --- Friend requests ---
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

        # --- Activity invitations ---
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

        # Sort all notifications by created_at descending
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