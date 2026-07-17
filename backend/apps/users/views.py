import hashlib
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken, Token

from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie, set_refresh_cookie
from .models import Block, User
from .serializers import (
    PasswordResetConfirmSerializer,
    PasswordResetSerializer,
    RegisterSerializer,
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
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegisterRateThrottle]


class DiscordAuthRateThrottle(AnonRateThrottle):
    # Reuses the 'login' scope — a Discord auth attempt is a login attempt
    # for rate-limiting purposes, same as the password-based one.
    scope = 'login'


class DiscordOAuthMixin:
    """Shared code exchange + profile fetch for anything talking to Discord's
    OAuth2 API. Used by both the anonymous login/register flow and the
    authenticated link flow below."""

    TOKEN_URL = 'https://discord.com/api/oauth2/token'
    PROFILE_URL = 'https://discord.com/api/users/@me'
    CALLBACK_PATH = '/oauth/discord/callback'

    def _resolve_redirect_uri(self, request):
        """Return redirect_uri for token exchange — must exactly match the one
        sent to Discord's authorize endpoint (typically origin + CALLBACK_PATH)."""
        configured = (settings.DISCORD_REDIRECT_URI or '').rstrip('/')
        requested = (request.data.get('redirect_uri') or '').rstrip('/')

        allowed = set()
        if configured:
            allowed.add(configured)

        frontend_base = (getattr(settings, 'FRONTEND_URL', '') or '').rstrip('/')
        if frontend_base:
            allowed.add(f'{frontend_base}{self.CALLBACK_PATH}')

        for origin in getattr(settings, 'CORS_ALLOWED_ORIGINS', []):
            allowed.add(f'{origin.rstrip("/")}{self.CALLBACK_PATH}')

        if requested:
            if requested in allowed:
                return requested
            origin = requested[: -len(self.CALLBACK_PATH)] if requested.endswith(self.CALLBACK_PATH) else ''
            if origin:
                for pattern in getattr(settings, 'CORS_ALLOWED_ORIGIN_REGEXES', []):
                    if re.match(pattern, origin):
                        return requested
            return None

        return configured or None

    def _exchange_code(self, code, redirect_uri):
        data = urllib.parse.urlencode({
            'client_id': settings.DISCORD_CLIENT_ID,
            'client_secret': settings.DISCORD_CLIENT_SECRET,
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri,
        }).encode()
        req = urllib.request.Request(
            self.TOKEN_URL,
            data=data,
            headers={
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Scalaris/1.0',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            try:
                return json.loads(e.read().decode())
            except (json.JSONDecodeError, UnicodeDecodeError):
                return None
        except (urllib.error.URLError, TimeoutError):
            return None

    def _discord_error_detail(self, token_data):
        if not isinstance(token_data, dict):
            return 'Discord authorization failed.'
        detail = token_data.get('error_description') or token_data.get('error') or 'Discord authorization failed.'
        if settings.DEBUG and token_data.get('error'):
            detail = f'{detail} ({token_data["error"]})'
        return detail

    def _fetch_profile(self, access_token):
        req = urllib.request.Request(
            self.PROFILE_URL,
            headers={
                'Authorization': f'Bearer {access_token}',
                'User-Agent': 'Scalaris/1.0',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
            return None

    def _exchange_and_fetch(self, code, redirect_uri):
        """Returns (profile, None) on success or (None, error_response) on failure."""
        if not settings.DISCORD_CLIENT_ID or not settings.DISCORD_CLIENT_SECRET:
            return None, Response(
                {'detail': 'Discord OAuth is not configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not redirect_uri:
            return None, Response({'detail': 'Missing redirect_uri.'}, status=status.HTTP_400_BAD_REQUEST)

        token_data = self._exchange_code(code, redirect_uri)
        if not isinstance(token_data, dict) or 'access_token' not in token_data:
            return None, Response(
                {'detail': self._discord_error_detail(token_data)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = self._fetch_profile(token_data['access_token'])
        if profile is None:
            return None, Response({'detail': 'Could not fetch Discord profile.'}, status=status.HTTP_400_BAD_REQUEST)

        return profile, None


class DiscordAuthView(DiscordOAuthMixin, APIView):
    """Exchanges a Discord OAuth `code` for the user's Discord profile,
    then either logs an existing linked user in, registers a brand-new
    account (if nothing local matches at all), or rejects the attempt.

    Deliberately never auto-links an existing, non-Discord account just
    because its email matches the Discord profile's email: that would let
    anyone who controls a Discord account with a given email silently take
    over an existing password-based account without ever proving they know
    its password. Linking has to be an explicit, separate action — see
    `DiscordLinkView` below, which requires the person to already be
    logged in on our side before it'll attach a Discord account.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [DiscordAuthRateThrottle]
    # Same as EmailTokenObtainPairView: stale Authorization headers must not
    # block issuing fresh credentials on this public login/register endpoint.
    authentication_classes = []

    def post(self, request):
        code = request.data.get('code')
        if not code:
            return Response({'detail': 'Missing code.'}, status=status.HTTP_400_BAD_REQUEST)

        redirect_uri = self._resolve_redirect_uri(request)
        if redirect_uri is None:
            return Response({'detail': 'Invalid redirect_uri.'}, status=status.HTTP_400_BAD_REQUEST)

        profile, error = self._exchange_and_fetch(code, redirect_uri)
        if error is not None:
            return error

        discord_id = str(profile['id'])
        email = profile.get('email') or ''

        user = User.objects.filter(discord_id=discord_id).first()

        if user is None:
            # No account linked to this Discord ID yet. If an account with
            # the same email already exists, it was created a different
            # way — refuse instead of silently linking it.
            if email and User.objects.filter(email__iexact=email).exists():
                return Response(
                    {'detail': 'no_linked_account'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            user = self._create_user(discord_id, email, profile)

        refresh = RefreshToken.for_user(user)
        response = Response({'access': str(refresh.access_token)}, status=status.HTTP_200_OK)
        set_refresh_cookie(response, refresh)
        return response

    def _create_user(self, discord_id, email, profile):
        base_username = profile.get('username') or f'discord_{discord_id}'
        username = base_username
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f'{base_username}{suffix}'

        user = User(
            username=username,
            email=email,
            discord_id=discord_id,
            discord_username=profile.get('username') or '',
        )
        # No password was ever set on our side — Discord is the only way
        # to log into this account, exactly as requested.
        user.set_unusable_password()
        user.save()
        return user


class DiscordLinkView(DiscordOAuthMixin, APIView):
    """Attaches a Discord account to the *currently logged-in* user.

    Requires the person to already hold a valid session — this is the
    explicit, separate linking action referenced in `DiscordAuthView`'s
    docstring. Refuses if that Discord account is already linked to a
    different Scalaris account.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [DiscordAuthRateThrottle]

    def post(self, request):
        code = request.data.get('code')
        if not code:
            return Response({'detail': 'Missing code.'}, status=status.HTTP_400_BAD_REQUEST)

        redirect_uri = self._resolve_redirect_uri(request)
        if redirect_uri is None:
            return Response({'detail': 'Invalid redirect_uri.'}, status=status.HTTP_400_BAD_REQUEST)

        profile, error = self._exchange_and_fetch(code, redirect_uri)
        if error is not None:
            return error

        discord_id = str(profile['id'])

        existing = User.objects.filter(discord_id=discord_id).exclude(pk=request.user.pk).first()
        if existing is not None:
            return Response(
                {'detail': 'Цей Discord-акаунт вже прив’язано до іншого користувача.'},
                status=status.HTTP_409_CONFLICT,
            )

        request.user.discord_id = discord_id
        request.user.discord_username = profile.get('username') or ''
        request.user.save(update_fields=['discord_id', 'discord_username'])

        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


class DiscordUnlinkView(APIView):
    """Detaches Discord from the current user.

    Refused when Discord is the only way into the account (no usable
    password set) — clearing it then would lock the person out entirely.
    """

    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        user = request.user
        if not user.discord_id:
            return Response({'detail': 'Discord не підключено.'}, status=status.HTTP_400_BAD_REQUEST)

        if not user.has_usable_password():
            return Response(
                {'detail': 'Спочатку встанови пароль для акаунту — інакше ти втратиш доступ після відключення Discord.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.discord_id = None
        user.discord_username = ''
        user.save(update_fields=['discord_id', 'discord_username'])
        return Response(status=status.HTTP_204_NO_CONTENT)


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


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class UserDetailView(generics.RetrieveAPIView):
    queryset = User.objects.all()
    serializer_class = UserPublicSerializer
    permission_classes = [permissions.IsAuthenticated]


class LogoutView(APIView):
    """Blacklists the refresh token when present, then clears the cookie.

    This intentionally accepts anonymous requests so a stale/expired access
    token cannot block logout from the browser. The refresh cookie is still
    removed even when no valid token is available."""
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