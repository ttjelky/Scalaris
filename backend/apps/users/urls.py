from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LogoutView, MeView, RegisterView, UserDetailView
from .token_views import EmailTokenObtainPairView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='user-register'),
    path('login/', EmailTokenObtainPairView.as_view(), name='token-obtain-pair'),
    path('login/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('logout/', LogoutView.as_view(), name='user-logout'),
    path('me/', MeView.as_view(), name='user-me'),
    path('<int:pk>/', UserDetailView.as_view(), name='user-detail'),
]
