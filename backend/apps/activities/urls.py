from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ActivityViewSet, InvitationViewSet, LocationViewSet

router = DefaultRouter()
router.register(r'locations', LocationViewSet, basename='location')
router.register(r'', ActivityViewSet, basename='activity')
router.register(r'invitations', InvitationViewSet, basename='invitation')

urlpatterns = [
    path('', include(router.urls)),
    path('locations/nearby/', LocationViewSet.as_view({'get': 'nearby'}), name='location-nearby'),
]