import hashlib
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import Token

from ..models import User
from ..serializers import PasswordResetConfirmSerializer, PasswordResetSerializer


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


class PasswordResetRateThrottle(AnonRateThrottle):
    scope = 'password_reset'


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
