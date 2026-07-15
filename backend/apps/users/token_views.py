from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie, set_refresh_cookie

User = get_user_model()


class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Lets the client send either `username` or an email address in the
    `username` field, since the mobile UI only exposes one 'account' input."""

    def validate(self, attrs):
        login = attrs.get('username', '')
        if '@' in login:
            user = User.objects.filter(email__iexact=login).first()
            if user:
                attrs['username'] = user.username
        return super().validate(attrs)


class EmailTokenObtainPairView(TokenObtainPairView):
    """Same login flow as before, except the refresh token never reaches
    the response body — it's set as an httpOnly cookie, and only the
    short-lived access token is returned to JS."""

    serializer_class = EmailOrUsernameTokenObtainPairSerializer

    def finalize_response(self, request, response, *args, **kwargs):
        if response.status_code == 200 and 'refresh' in response.data:
            refresh = response.data.pop('refresh')
            set_refresh_cookie(response, refresh)
        return super().finalize_response(request, response, *args, **kwargs)


class CookieTokenRefreshView(TokenRefreshView):
    """Drop-in replacement for simplejwt's TokenRefreshView: reads the
    refresh token from the httpOnly cookie instead of the request body,
    and — because ROTATE_REFRESH_TOKENS is on — writes the newly rotated
    refresh token back into the cookie rather than the response body."""

    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not refresh_token:
            return Response(
                {'detail': 'Refresh token cookie missing.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = TokenRefreshSerializer(data={'refresh': refresh_token})
        try:
            serializer.is_valid(raise_exception=True)
        except (InvalidToken, TokenError):
            response = Response(
                {'detail': 'Refresh token invalid or expired.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response

        data = serializer.validated_data
        response = Response({'access': data['access']}, status=status.HTTP_200_OK)

        new_refresh = data.get('refresh')  # present because ROTATE_REFRESH_TOKENS=True
        if new_refresh:
            set_refresh_cookie(response, new_refresh)

        return response
