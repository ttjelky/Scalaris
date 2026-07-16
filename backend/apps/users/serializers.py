from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User


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
        fields = ['id', 'username', 'email', 'avatar', 'bio', 'is_visible_on_map']
        read_only_fields = ['id']


class UserPublicSerializer(serializers.ModelSerializer):
    avatar = RelativeImageField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'avatar', 'bio']


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
    email = serializers.EmailField()

    def validate_email(self, value):
        if not User.objects.filter(email__iexact=value).exists():
            # Don't reveal if email exists or not for security
            raise serializers.ValidationError('If an account with this email exists, you will receive a password reset link.')
        return value


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password_confirm'):
            raise serializers.ValidationError({'password_confirm': "Passwords don't match."})
        return attrs