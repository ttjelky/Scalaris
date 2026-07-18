"""
Публічний views-модуль apps.users, розділений на тематичні файли:

- auth.py            — реєстрація, вихід (login/refresh — у token_views.py)
- password_reset.py  — скидання паролю (токен, запит, підтвердження)
- discord.py          — Discord OAuth (мьюдж, вхід, прив'язка/відв'язка)
- profile.py          — /me/ та перегляд чужого профілю
- block_report.py    — блокування та скарги
- friends.py          — система друзів
- notifications.py   — сповіщення

Усі імена ре-експортуються тут, тому existing `from . import views` та
`from .views import SomeView` (наприклад, у urls.py) продовжують працювати
без змін.
"""
from .auth import LogoutView, RegisterRateThrottle, RegisterView
from .block_report import BlockedUsersListView, BlockView, ReportUserView
from .discord import (
    DiscordAuthRateThrottle,
    DiscordAuthView,
    DiscordLinkView,
    DiscordOAuthMixin,
    DiscordUnlinkView,
)
from .friends import (
    AcceptFriendRequestView,
    FriendsListView,
    ReceivedFriendRequestsView,
    RejectFriendRequestView,
    RemoveFriendView,
    SendFriendRequestView,
    SentFriendRequestsView,
)
from .notifications import NotificationsCountView, NotificationsView
from .password_reset import (
    PasswordResetConfirmView,
    PasswordResetRateThrottle,
    PasswordResetToken,
    PasswordResetView,
    _password_fingerprint,
)
from .profile import MeView, UserDetailView

__all__ = [
    'AcceptFriendRequestView',
    'BlockView',
    'BlockedUsersListView',
    'DiscordAuthRateThrottle',
    'DiscordAuthView',
    'DiscordLinkView',
    'DiscordOAuthMixin',
    'DiscordUnlinkView',
    'FriendsListView',
    'LogoutView',
    'MeView',
    'NotificationsCountView',
    'NotificationsView',
    'PasswordResetConfirmView',
    'PasswordResetRateThrottle',
    'PasswordResetToken',
    'PasswordResetView',
    'ReceivedFriendRequestsView',
    'RegisterRateThrottle',
    'RegisterView',
    'RejectFriendRequestView',
    'RemoveFriendView',
    'ReportUserView',
    'SendFriendRequestView',
    'SentFriendRequestsView',
    'UserDetailView',
    '_password_fingerprint',
]
