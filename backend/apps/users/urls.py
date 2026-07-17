from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    BlockedUsersListView,
    BlockUserView,
    DiscordCallbackView,
    DiscordUnlinkView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetView,
    RegisterView,
    ReportUserView,
    UserDetailView,
)
from .token_views import EmailTokenObtainPairView, CookieTokenRefreshView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='user-register'),
    path('login/', EmailTokenObtainPairView.as_view(), name='token-obtain-pair'),
    path('login/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='user-logout'),
    path('me/', MeView.as_view(), name='user-me'),
    path('password-reset/', PasswordResetView.as_view(), name='password-reset'),
    path('password-reset-confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('blocked/', BlockedUsersListView.as_view(), name='user-blocked-list'),
    path('oauth/discord/callback/', DiscordCallbackView.as_view(), name='oauth-discord-callback'),
    path('oauth/discord/unlink/', DiscordUnlinkView.as_view(), name='oauth-discord-unlink'),
    path('<int:pk>/', UserDetailView.as_view(), name='user-detail'),
    path('<int:pk>/block/', BlockUserView.as_view(), name='user-block'),
    path('<int:pk>/report/', ReportUserView.as_view(), name='user-report'),
]