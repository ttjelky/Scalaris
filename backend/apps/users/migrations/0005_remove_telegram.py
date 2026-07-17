from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_telegramlinkcode'),
    ]

    operations = [
        migrations.DeleteModel(
            name='TelegramLinkCode',
        ),
        migrations.RemoveField(
            model_name='user',
            name='telegram_id',
        ),
        migrations.RemoveField(
            model_name='user',
            name='telegram_username',
        ),
    ]
