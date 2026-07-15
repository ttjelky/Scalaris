from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

User = get_user_model()


class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Lets the client send either `username` or an email address in the
    `username` field, since the mobile UI only exposes one 'account' input."""

    def validate(self, attrs):
        login = attrs.get('username', '')
        if '@' in login:
            user = User.objects.filter(email__iexact=login).first()
            if user:
                attrs['username'] = user.username
        return super().validate(attrs)


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailOrUsernameTokenObtainPairSerializer
