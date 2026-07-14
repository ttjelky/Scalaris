import json
from channels.generic.websocket import AsyncWebsocketConsumer

class YardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.yard_id = self.scope['url_route']['kwargs']['yard_id']
        self.group_name = f'yard_{self.yard_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        await self.channel_layer.group_send(self.group_name, {
            'type': 'yard_event',
            'data': data,
        })

    async def yard_event(self, event):
        await self.send(text_data=json.dumps(event['data']))