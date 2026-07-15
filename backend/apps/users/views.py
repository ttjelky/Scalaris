from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken, Token

from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie
from .models import User
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


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


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
    """Initiate password reset: send a reset token (in dev, returned in response)."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # Return the same response for security (don't leak email existence)
            return Response(
                {'detail': 'If an account with this email exists, you will receive a password reset link.'},
                status=status.HTTP_200_OK,
            )

        # Generate a password reset token
        reset_token = PasswordResetToken.for_user(user)
        reset_token['email'] = str(user.email)

        reset_link = f'{settings.FRONTEND_URL}/password-reset?token={reset_token}'

        send_mail(
            subject='Відновлення паролю',
            message=(
                'Ви (або хтось інший) запросили відновлення паролю.\n\n'
                f'Перейдіть за посиланням, щоб встановити новий пароль:\n{reset_link}\n\n'
                'Посилання дійсне 1 годину. Якщо ви не робили цей запит, просто проігноруйте лист.'
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

        response_data = {'detail': 'Password reset link sent.'}
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

        user.set_password(new_password)
        user.save()

        return Response(
            {'detail': 'Password has been reset successfully. You can now log in with your new password.'},
            status=status.HTTP_200_OK,
        )