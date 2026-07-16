import time

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.users.models import TelegramLinkCode, User


class Command(BaseCommand):
    """Довгий polling Telegram Bot API (getUpdates), який слухає команду
    /start <code> і привʼязує telegram_id/telegram_username до юзера, що
    згенерував цей код на сторінці профілю.

    Запускати окремим процесом поруч із Django-сервером, наприклад:

        python manage.py telegram_bot

    Не вимагає публічного домену чи вебхука — усе через long polling,
    тому працює однаково і на localhost, і в проді.
    """

    help = 'Слухає Telegram-бота (long polling) і привʼязує акаунти за одноразовим кодом /start.'

    def handle(self, *args, **options):
        token = settings.TELEGRAM_BOT_TOKEN
        if not token:
            raise CommandError('TELEGRAM_BOT_TOKEN не задано в backend/.env')

        api_base = f'https://api.telegram.org/bot{token}'
        offset = None

        self.stdout.write(self.style.SUCCESS(
            f'Telegram-бот @{settings.TELEGRAM_BOT_USERNAME or "?"} запущено. Очікую /start …'
        ))

        while True:
            try:
                resp = requests.get(
                    f'{api_base}/getUpdates',
                    params={'timeout': 30, 'offset': offset},
                    timeout=35,
                )
                resp.raise_for_status()
                payload = resp.json()
            except requests.RequestException as exc:
                self.stderr.write(f'Помилка мережі під час getUpdates: {exc}. Повтор через 5с…')
                time.sleep(5)
                continue

            if not payload.get('ok'):
                self.stderr.write(f'Telegram повернув помилку: {payload}. Повтор через 5с…')
                time.sleep(5)
                continue

            for update in payload.get('result', []):
                offset = update['update_id'] + 1
                self._handle_update(api_base, update)

    def _handle_update(self, api_base, update):
        message = update.get('message')
        if not message:
            return

        text = (message.get('text') or '').strip()
        chat_id = message['chat']['id']
        from_user = message.get('from', {})

        if not text.startswith('/start'):
            self._send(api_base, chat_id, 'Привіт! Щоб підключити акаунт, тисни "Підключити Telegram" у профілі Scalaris — звідти прийде правильне посилання.')
            return

        parts = text.split(maxsplit=1)
        code = parts[1].strip() if len(parts) > 1 else ''
        if not code:
            self._send(api_base, chat_id, 'Не знайшов код підключення. Повернись у профіль Scalaris і тисни "Підключити Telegram" ще раз.')
            return

        try:
            link_code = TelegramLinkCode.objects.get(code=code)
        except TelegramLinkCode.DoesNotExist:
            self._send(api_base, chat_id, 'Код недійсний або вже використаний. Згенеруй новий у профілі Scalaris.')
            return

        if link_code.is_expired():
            link_code.delete()
            self._send(api_base, chat_id, 'Код прострочився (діє 10 хв). Згенеруй новий у профілі Scalaris.')
            return

        telegram_id = str(chat_id)
        telegram_username = from_user.get('username', '') or ''

        # Той самий Telegram-акаунт міг раніше бути прив'язаний до іншого
        # нашого юзера — відв'язуємо звідти, інакше впадемо на unique-constraint.
        User.objects.filter(telegram_id=telegram_id).exclude(pk=link_code.user_id).update(
            telegram_id=None, telegram_username=''
        )

        user = link_code.user
        user.telegram_id = telegram_id
        user.telegram_username = telegram_username
        user.save(update_fields=['telegram_id', 'telegram_username'])
        link_code.delete()

        self._send(api_base, chat_id, f'✅ Акаунт Scalaris ({user.username}) успішно привʼязано! Можеш повертатись у застосунок.')

    def _send(self, api_base, chat_id, text):
        try:
            requests.post(f'{api_base}/sendMessage', json={'chat_id': chat_id, 'text': text}, timeout=10)
        except requests.RequestException:
            pass  # best-effort — не критично, якщо підтвердження не дійшло
