from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Block, Report, User


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

    class Meta:
        model = User
        fields = ['id', 'username', 'avatar', 'bio', 'phone', 'is_blocked']

    def get_is_blocked(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return Block.objects.filter(blocker=request.user, blocked=obj).exists()


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