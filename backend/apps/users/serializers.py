from django.contrib.auth.password_validation import validate_password
from django.db.models import Q
from rest_framework import serializers

from .models import Block, FriendRequest, Report, User


class RelativeImageField(serializers.ImageField):
    """Like ImageField, but always serializes to a relative (MEDIA_URL-based)
    path instead of an absolute URI.

    DRF's default ImageField.to_representation() calls
    `request.build_absolute_uri(value.url)` whenever a `request` is present
    in the serializer context (which it always is for API views). This
    override skips that and just returns `value.url` as-is, so uploads
    still work exactly as before — only the read representation changes.
    """

    def to_representation(self, value):
        if not value:
            return None
        return value.url


class UserSerializer(serializers.ModelSerializer):
    avatar = RelativeImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'avatar', 'bio', 'phone', 'is_visible_on_map',
            'discord_username', 'telegram_username',
        ]
        read_only_fields = ['id', 'discord_username', 'telegram_username']


class UserPublicSerializer(serializers.ModelSerializer):
    avatar = RelativeImageField(read_only=True)
    is_blocked = serializers.SerializerMethodField()
    friendship_status = serializers.SerializerMethodField()
    friend_request_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'avatar', 'bio', 'phone', 'is_blocked',
            'friendship_status', 'friend_request_id',
        ]

    def get_is_blocked(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return Block.objects.filter(blocker=request.user, blocked=obj).exists()

    def get_friendship_status(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated or request.user.pk == obj.pk:
            return 'none'
        if request.user.friends.filter(pk=obj.pk).exists():
            return 'friends'
        if FriendRequest.objects.filter(from_user=request.user, to_user=obj).exists():
            return 'request_sent'
        if FriendRequest.objects.filter(from_user=obj, to_user=request.user).exists():
            return 'request_received'
        return 'none'

    def get_friend_request_id(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated or request.user.pk == obj.pk:
            return None
        friend_request = FriendRequest.objects.filter(
            Q(from_user=request.user, to_user=obj) | Q(from_user=obj, to_user=request.user),
        ).first()
        return friend_request.id if friend_request else None


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'password_confirm']
        read_only_fields = ['id']

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password_confirm'):
            raise serializers.ValidationError({'password_confirm': "Passwords don't match."})
        return attrs

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
        )
    
class FriendRequestSerializer(serializers.ModelSerializer):
    # read_only=True гарантує, що ми використовуємо ці серіалізатори лише для читання даних,
    # а не для їх створення через API
    from_user = UserPublicSerializer(read_only=True)
    to_user = UserPublicSerializer(read_only=True)

    class Meta:
        model = FriendRequest
        fields = ['id', 'from_user', 'to_user', 'created_at']


class PasswordResetSerializer(serializers.Serializer):
    """Only validates that `email` is a well-formed email address.

    Deliberately does NOT check whether the address belongs to a real
    account: that check now lives entirely in PasswordResetView, which
    always returns the same 200 response either way. Doing the existence
    check here used to return 400 for unknown emails vs. 200 for known
    ones — a textbook account-enumeration oracle via the status code,
    regardless of what the error text said.
    """
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password_confirm'):
            raise serializers.ValidationError({'password_confirm': "Passwords don't match."})
        return attrs


class ReportSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=Report.Reason.choices)
    details = serializers.CharField(max_length=500, required=False, allow_blank=True)