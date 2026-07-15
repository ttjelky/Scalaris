from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetView,
    RegisterView,
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
    path('<int:pk>/', UserDetailView.as_view(), name='user-detail'),
]
