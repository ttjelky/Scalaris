from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/yard/(?P<yard_id>\w+)/$', consumers.YardConsumer.as_asgi()),
]