import json
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


def _extract_token(query_string: bytes) -> str:
    """Extract ``token`` from a raw query-string bytes."""
    params = parse_qs(query_string.decode())
    tokens = params.get('token', [])
    return tokens[0] if tokens else ''


class NotificationConsumer(AsyncWebsocketConsumer):
    """WebSocket for real-time notification count updates.

    Connects with: ws/notifications/?token=<access_token>
    Joins user-specific group: notifications_<user_id>
    Server sends: { "type": "notification_count", "count": <int> }
    """

    async def connect(self):
        self.user = None
        token = _extract_token(self.scope['query_string'])

        if not token:
            await self.close(code=4001)
            return

        try:
            access_token = AccessToken(token)
            self.user_id = access_token['user_id']
            self.user = await self.get_user(self.user_id)
        except (InvalidToken, TokenError, KeyError):
            await self.close(code=4001)
            return

        if not self.user:
            await self.close(code=4001)
            return

        self.group_name = f'notifications_{self.user_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Send initial count
        count = await self.get_notification_count()
        await self.send(text_data=json.dumps({
            'type': 'notification_count',
            'count': count,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            return
        msg_type = data.get('type')

        if msg_type == 'get_count':
            count = await self.get_notification_count()
            await self.send(text_data=json.dumps({
                'type': 'notification_count',
                'count': count,
            }))

    async def notification_update(self, event):
        """Handler for group_send from views when a new notification is created."""
        await self.send(text_data=json.dumps({
            'type': 'notification_count',
            'count': event['count'],
        }))

    @database_sync_to_async
    def get_user(self, user_id):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None

    @database_sync_to_async
    def get_notification_count(self):
        from apps.users.models import FriendRequest
        from apps.activities.models import Invitation

        friend_request_count = FriendRequest.objects.filter(to_user=self.user).count()
        invitation_count = Invitation.objects.filter(
            to_user=self.user,
            status=Invitation.Status.PENDING,
        ).count()
        return friend_request_count + invitation_count


class ActivityConsumer(AsyncWebsocketConsumer):
    """WebSocket for real-time activity participant status updates.

    Connects with: ws/activity/<activity_id>/?token=<access_token>
    Joins activity group: activity_<activity_id>
    Server sends: { "type": "participant_update", "participant": {...}, "activity_status": "..." }
    """

    async def connect(self):
        self.activity_id = self.scope['url_route']['kwargs']['activity_id']
        token = _extract_token(self.scope['query_string'])

        if not token:
            await self.close(code=4001)
            return

        try:
            access_token = AccessToken(token)
            self.user_id = access_token['user_id']
            self.user = await self.get_user(self.user_id)
        except (InvalidToken, TokenError, KeyError):
            await self.close(code=4001)
            return

        if not self.user:
            await self.close(code=4001)
            return

        # Only allow creator or participants to connect.
        # Nonexistent activities are allowed (returns "unknown" state).
        is_participant = await self._is_participant()
        if is_participant is False:
            await self.close(code=4003)
            return

        self.group_name = f'activity_{self.activity_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Send current state
        state = await self.get_activity_state()
        if state:
            await self.send(text_data=json.dumps({
                'type': 'activity_state',
                **state,
            }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'activity_state',
                'live_status': 'unknown',
                'participants': [],
            }))

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            return
        msg_type = data.get('type')

        if msg_type == 'get_state':
            state = await self.get_activity_state()
            if state:
                await self.send(text_data=json.dumps({
                    'type': 'activity_state',
                    **state,
                }))

    async def participant_update(self, event):
        """Handler for group_send from views when participant status changes."""
        await self.send(text_data=json.dumps({
            'type': 'participant_update',
            'participant': event['participant'],
            'activity_status': event['activity_status'],
        }))

    async def activity_cancelled(self, event):
        """Handler when the activity creator cancels the activity."""
        await self.send(text_data=json.dumps({
            'type': 'activity_cancelled',
        }))

    @database_sync_to_async
    def get_user(self, user_id):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None

    @database_sync_to_async
    def _is_participant(self):
        """Return True if the user is the creator or an invited participant.

        Returns ``None`` if the activity does not exist (caller should
        allow the connection — the consumer sends an "unknown" state).
        """
        from apps.activities.models import Activity, Invitation

        try:
            activity = Activity.objects.get(pk=self.activity_id)
        except Activity.DoesNotExist:
            return None

        if activity.creator_id == self.user_id:
            return True

        return Invitation.objects.filter(
            activity=activity,
            to_user_id=self.user_id,
        ).exists()

    @database_sync_to_async
    def get_activity_state(self):
        from apps.activities.models import Activity, Invitation

        try:
            activity = Activity.objects.get(pk=self.activity_id)
        except Activity.DoesNotExist:
            return None

        invitations = activity.invitations.select_related('to_user').all()
        participants = []
        for inv in invitations:
            participants.append({
                'id': inv.to_user.id,
                'username': inv.to_user.username,
                'status': inv.status,
            })

        return {
            'live_status': activity.live_status,
            'participants': participants,
        }


def notify_user(user_id, count):
    """Synchronous helper to send notification update to a user's WebSocket group.

    Call this from views after creating/deleting friend requests or invitations.
    """
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'notifications_{user_id}',
        {
            'type': 'notification_update',
            'count': count,
        }
    )


def notify_activity_participants(activity_id, participant, activity_status):
    """Synchronous helper to broadcast participant status change to activity group."""
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'activity_{activity_id}',
        {
            'type': 'participant_update',
            'participant': participant,
            'activity_status': activity_status,
        }
    )


def notify_activity_cancelled(activity_id):
    """Synchronous helper to notify all participants that activity was cancelled."""
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'activity_{activity_id}',
        {
            'type': 'activity_cancelled',
        }
    )


def notify_zone_deleted(activity_id):
    """Synchronous helper to broadcast zone deletion to all map viewers."""
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        'zones_broadcast',
        {
            'type': 'zone_deleted',
            'activity_id': activity_id,
        }
    )


class ZoneBroadcastConsumer(AsyncWebsocketConsumer):
    """WebSocket for real-time zone map updates (deletions).

    Connects with: ws/zones/?token=<access_token>
    Joins global group: zones_broadcast
    Server sends: { "type": "zone_deleted", "activity_id": <int> }
    """

    async def connect(self):
        token = self.scope['query_string'].decode().split('token=')[-1].split('&')[0] if b'token=' in self.scope['query_string'] else ''

        if not token:
            await self.close(code=4001)
            return

        try:
            access_token = AccessToken(token)
            self.user_id = access_token['user_id']
        except (InvalidToken, TokenError, KeyError):
            await self.close(code=4001)
            return

        self.group_name = 'zones_broadcast'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        pass

    async def zone_deleted(self, event):
        await self.send(text_data=json.dumps({
            'type': 'zone_deleted',
            'activity_id': event['activity_id'],
        }))
