from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0010_merge_20260717_2337'),
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
