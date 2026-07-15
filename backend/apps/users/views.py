from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie
from .models import User
from .serializers import RegisterSerializer, UserPublicSerializer, UserSerializer


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
