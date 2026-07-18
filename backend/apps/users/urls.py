from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

from .views import (
    BlockedUsersListView,
    BlockView,
    DiscordAuthView,
    DiscordLinkView,
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
    path('auth/discord/', DiscordAuthView.as_view(), name='discord-auth'),
    path('oauth/discord/link/', DiscordLinkView.as_view(), name='discord-link'),
    path('oauth/discord/unlink/', DiscordUnlinkView.as_view(), name='discord-unlink'),
    path('logout/', LogoutView.as_view(), name='user-logout'),
    path('me/', MeView.as_view(), name='user-me'),
    path('blocked/', BlockedUsersListView.as_view(), name='user-blocked-list'),
    path('password-reset/', PasswordResetView.as_view(), name='password-reset'),
    path('password-reset-confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('<int:pk>/block/', BlockView.as_view(), name='user-block'),
    path('<int:pk>/', UserDetailView.as_view(), name='user-detail'),
    path('<int:pk>/report/', ReportUserView.as_view(), name='user-report'),
    # Дії з конкретними користувачами
    path('<int:pk>/friend-request/', views.SendFriendRequestView.as_view(), name='send-friend-request'),
    path('<int:pk>/friend/', views.RemoveFriendView.as_view(), name='remove-friend'),
    
    # Дії з конкретними запитами (по ID самого запиту, а не користувача)
    path('friend-requests/<int:pk>/accept/', views.AcceptFriendRequestView.as_view(), name='accept-friend-request'),
    path('friend-requests/<int:pk>/reject/', views.RejectFriendRequestView.as_view(), name='reject-friend-request'),
    
    # Списки для поточного користувача (Me)
    path('me/friends/', views.FriendsListView.as_view(), name='my-friends'),
    path('me/friend-requests/sent/', views.SentFriendRequestsView.as_view(), name='sent-friend-requests'),
    path('me/friend-requests/received/', views.ReceivedFriendRequestsView.as_view(), name='received-friend-requests'),
    # Сповіщення
    path('me/notifications/', views.NotificationsView.as_view(), name='notifications'),
    path('me/notifications/count/', views.NotificationsCountView.as_view(), name='notifications-count'),
]
