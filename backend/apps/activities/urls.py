from django.urls import path

from .views import (
    ActivityDetailView,
    ActivityListCreateView,
    InvitationListCreateView,
    InvitationRespondView,
    LocationUpdateView,
    NearbyUsersView,
)

urlpatterns = [
    path('locations/', LocationUpdateView.as_view(), name='location-update'),
    path('locations/nearby/', NearbyUsersView.as_view(), name='nearby-users'),

    path('activities/', ActivityListCreateView.as_view(), name='activity-list'),
    path('activities/<int:pk>/', ActivityDetailView.as_view(), name='activity-detail'),

    path('invitations/', InvitationListCreateView.as_view(), name='invitation-list'),
    path('invitations/<int:pk>/respond/', InvitationRespondView.as_view(), name='invitation-respond'),
]