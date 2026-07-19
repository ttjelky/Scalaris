from rest_framework import serializers

from apps.users.models import User
from apps.users.serializers import UserPublicSerializer
from ..models import Activity, Invitation


class InvitationSerializer(serializers.ModelSerializer):
    """
    Читання: повні дані from_user/to_user/activity.
    Створення: from_user береться з request.user, to_user/activity — по id.
    """
    from_user = UserPublicSerializer(read_only=True)
    to_user = UserPublicSerializer(read_only=True)
    to_user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='to_user', write_only=True
    )
    activity_id = serializers.PrimaryKeyRelatedField(
        queryset=Activity.objects.all(), source='activity', write_only=True
    )

    class Meta:
        model = Invitation
        fields = [
            'id', 'from_user', 'to_user', 'to_user_id',
            'activity', 'activity_id', 'status', 'created_at',
        ]
        read_only_fields = ['id', 'from_user', 'activity', 'status', 'created_at']

    def validate(self, attrs):
        from_user = self.context['request'].user
        to_user = attrs.get('to_user')
        activity = attrs.get('activity')

        if from_user == to_user:
            raise serializers.ValidationError("Не можна відправити запрошення самому собі.")

        if activity.creator == to_user:
            raise serializers.ValidationError("Цей користувач є автором активності й вже бере участь у ній.")

        if Invitation.objects.filter(from_user=from_user, to_user=to_user, activity=activity).exists():
            raise serializers.ValidationError("Запрошення для цього користувача на цю активність вже надіслано.")

        return attrs

    def create(self, validated_data):
        validated_data['from_user'] = self.context['request'].user
        return Invitation.objects.create(**validated_data)


class InvitationRespondSerializer(serializers.ModelSerializer):
    """Отримувач запрошення може лише прийняти або відхилити"""

    class Meta:
        model = Invitation
        fields = ['status']

    def validate_status(self, value):
        allowed = [Invitation.Status.ACCEPTED, Invitation.Status.DECLINED]
        if value not in allowed:
            raise serializers.ValidationError(
                "Статус можна змінити лише на 'accepted' або 'declined'"
            )
        return value

    def update(self, instance, validated_data):
        status = validated_data.get('status')
        if status == Invitation.Status.ACCEPTED:
            instance.accept()
        elif status == Invitation.Status.DECLINED:
            instance.decline()

        try:
            from api.consumers import notify_activity_participants, notify_user
            from apps.users.models import FriendRequest

            participant = {
                'id': instance.to_user.id,
                'username': instance.to_user.username,
                'status': instance.status,
            }
            notify_activity_participants(instance.activity_id, participant, instance.activity.live_status)

            fr_count = FriendRequest.objects.filter(to_user=instance.activity.creator).count()
            inv_count = Invitation.objects.filter(
                to_user=instance.activity.creator,
                status=Invitation.Status.PENDING,
            ).count()
            notify_user(instance.activity.creator_id, fr_count + inv_count)
        except Exception:
            pass

        return instance
