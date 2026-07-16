from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsCreatorOrReadOnly(BasePermission):
    """Дозволяє читати всім, але змінювати/видаляти лише творцю активності."""

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and obj.creator_id == request.user.id)


class IsInvitationReceiver(BasePermission):
    """Дозволяє відповідати на запрошення лише користувачу, якому його адресовано."""

    def has_object_permission(self, request, view, obj):
        return bool(request.user and request.user.is_authenticated and obj.to_user_id == request.user.id)
