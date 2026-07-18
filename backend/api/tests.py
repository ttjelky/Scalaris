"""
Тести для api.consumers (WebSocket): NotificationConsumer та ActivityConsumer.

ВАЖЛИВО: `api/` не є Django-застосунком (немає apps.py, немає запису в
INSTALLED_APPS — у ньому немає моделей, лише consumers.py/routing.py), тому
`manage.py test` без аргументів цей файл автоматично НЕ підхопить. Запускайте
явно:

    python manage.py test api.tests

Використовує InMemoryChannelLayer (через override_settings), тому реального
Redis не потрібно — весь group_send/group_add відбувається в пам'яті одного
процесу, чого достатньо для тестів.

Потребує channels>=4 (WebsocketCommunicator) та Django >=4.1 (підтримка
`async def test_...` методів у TestCase/TransactionTestCase).
"""
from asgiref.sync import sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from api.consumers import notify_activity_cancelled, notify_activity_participants, notify_user
from api.routing import websocket_urlpatterns
from apps.activities.models import Activity, Invitation
from apps.users.models import FriendRequest

User = get_user_model()

TEST_CHANNEL_LAYERS = {
    'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'},
}


def make_point(lat=50.4501, lng=30.5234):
    return Point(lng, lat, srid=4326)


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class NotificationConsumerTests(TransactionTestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.bob = User.objects.create_user(username='bob', email='b@example.com', password='pw')
        self.token = str(AccessToken.for_user(self.alice))
        self.application = URLRouter(websocket_urlpatterns)

    async def test_connect_without_token_is_rejected(self):
        communicator = WebsocketCommunicator(self.application, '/api/ws/notifications/')
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_connect_with_invalid_token_is_rejected(self):
        communicator = WebsocketCommunicator(
            self.application, '/api/ws/notifications/?token=not-a-real-token',
        )
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_connect_with_valid_token_sends_initial_count(self):
        await sync_to_async(FriendRequest.objects.create)(from_user=self.bob, to_user=self.alice)

        communicator = WebsocketCommunicator(
            self.application, f'/api/ws/notifications/?token={self.token}',
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        message = await communicator.receive_json_from()
        self.assertEqual(message['type'], 'notification_count')
        self.assertEqual(message['count'], 1)

        await communicator.disconnect()

    async def test_get_count_message_returns_current_count(self):
        communicator = WebsocketCommunicator(
            self.application, f'/api/ws/notifications/?token={self.token}',
        )
        await communicator.connect()
        await communicator.receive_json_from()  # initial count on connect

        await sync_to_async(FriendRequest.objects.create)(from_user=self.bob, to_user=self.alice)
        await communicator.send_json_to({'type': 'get_count'})

        message = await communicator.receive_json_from()
        self.assertEqual(message['type'], 'notification_count')
        self.assertEqual(message['count'], 1)

        await communicator.disconnect()

    async def test_notify_user_pushes_update_to_connected_socket(self):
        communicator = WebsocketCommunicator(
            self.application, f'/api/ws/notifications/?token={self.token}',
        )
        await communicator.connect()
        await communicator.receive_json_from()  # initial count

        await sync_to_async(notify_user)(self.alice.pk, 5)

        message = await communicator.receive_json_from()
        self.assertEqual(message, {'type': 'notification_count', 'count': 5})

        await communicator.disconnect()


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class ActivityConsumerTests(TransactionTestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username='alice', email='a@example.com', password='pw')
        self.bob = User.objects.create_user(username='bob', email='b@example.com', password='pw')
        self.token = str(AccessToken.for_user(self.alice))
        self.activity = Activity.objects.create(
            creator=self.alice, title='Run', point=make_point(),
            started_at=timezone.now(), category=Activity.Category.SPORT,
            live_status=Activity.LiveStatus.ACTIVE,
        )
        Invitation.objects.create(from_user=self.alice, to_user=self.bob, activity=self.activity)
        self.application = URLRouter(websocket_urlpatterns)

    async def test_connect_without_token_is_rejected(self):
        communicator = WebsocketCommunicator(
            self.application, f'/api/ws/activity/{self.activity.pk}/',
        )
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_connect_sends_current_activity_state(self):
        communicator = WebsocketCommunicator(
            self.application, f'/api/ws/activity/{self.activity.pk}/?token={self.token}',
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        message = await communicator.receive_json_from()
        self.assertEqual(message['type'], 'activity_state')
        self.assertEqual(message['live_status'], Activity.LiveStatus.ACTIVE)
        usernames = [p['username'] for p in message['participants']]
        self.assertIn('bob', usernames)

        await communicator.disconnect()

    async def test_connect_to_nonexistent_activity_reports_unknown_state(self):
        communicator = WebsocketCommunicator(
            self.application, f'/api/ws/activity/999999/?token={self.token}',
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        message = await communicator.receive_json_from()
        self.assertEqual(message['live_status'], 'unknown')
        self.assertEqual(message['participants'], [])

        await communicator.disconnect()

    async def test_participant_update_is_broadcast_to_connected_clients(self):
        communicator = WebsocketCommunicator(
            self.application, f'/api/ws/activity/{self.activity.pk}/?token={self.token}',
        )
        await communicator.connect()
        await communicator.receive_json_from()  # initial activity_state

        participant = {'id': self.bob.pk, 'username': 'bob', 'status': 'accepted'}
        await sync_to_async(notify_activity_participants)(self.activity.pk, participant, 'active')

        message = await communicator.receive_json_from()
        self.assertEqual(message['type'], 'participant_update')
        self.assertEqual(message['participant'], participant)
        self.assertEqual(message['activity_status'], 'active')

        await communicator.disconnect()

    async def test_activity_cancelled_is_broadcast_to_connected_clients(self):
        communicator = WebsocketCommunicator(
            self.application, f'/api/ws/activity/{self.activity.pk}/?token={self.token}',
        )
        await communicator.connect()
        await communicator.receive_json_from()  # initial activity_state

        await sync_to_async(notify_activity_cancelled)(self.activity.pk)

        message = await communicator.receive_json_from()
        self.assertEqual(message['type'], 'activity_cancelled')

        await communicator.disconnect()

    async def test_get_state_message_returns_current_state(self):
        communicator = WebsocketCommunicator(
            self.application, f'/api/ws/activity/{self.activity.pk}/?token={self.token}',
        )
        await communicator.connect()
        await communicator.receive_json_from()  # initial activity_state

        await communicator.send_json_to({'type': 'get_state'})
        message = await communicator.receive_json_from()
        self.assertEqual(message['type'], 'activity_state')
        self.assertEqual(message['live_status'], Activity.LiveStatus.ACTIVE)

        await communicator.disconnect()