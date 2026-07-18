from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'api/ws/notifications/$', consumers.NotificationConsumer.as_asgi()),
    re_path(r'api/ws/activity/(?P<activity_id>\d+)/$', consumers.ActivityConsumer.as_asgi()),
    re_path(r'api/ws/zones/$', consumers.ZoneBroadcastConsumer.as_asgi()),
]
