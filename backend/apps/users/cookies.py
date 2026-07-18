"""
Helpers for storing the JWT refresh token as an httpOnly cookie instead of
returning it in the response body. Keeping it out of JS reach means an XSS
bug can't exfiltrate a 7-day-lived token — the worst it can do is ride the
short-lived (15 min) access token that's already in play.

`djangorestframework-simplejwt` doesn't ship cookie support itself, so this
is a small manual wrapper around `settings.SIMPLE_JWT`'s custom keys.
"""

from django.conf import settings

_JWT = settings.SIMPLE_JWT

REFRESH_COOKIE_NAME = _JWT.get('AUTH_COOKIE', 'refresh_token')
REFRESH_COOKIE_PATH = _JWT.get('AUTH_COOKIE_PATH', '/')
REFRESH_COOKIE_SECURE = _JWT.get('AUTH_COOKIE_SECURE', True)
# Must be 'Lax' (not 'Strict'): the refresh cookie is sent on top-level
# cross-site navigations back from Discord's OAuth redirect (the browser
# lands on our callback route, which then calls /users/login/refresh/ with
# credentials). 'Strict' would drop the cookie on that navigation and every
# Discord login would fail to restore the session. The extra CSRF surface is
# negligible here because the cookie is httpOnly and only ever carries the
# refresh token, which itself can't be used to mutate anything without a
# valid access token issued from it.
REFRESH_COOKIE_SAMESITE = _JWT.get('AUTH_COOKIE_SAMESITE', 'Lax')
REFRESH_COOKIE_DOMAIN = _JWT.get('AUTH_COOKIE_DOMAIN', None)


def set_refresh_cookie(response, refresh_token):
    """Attach the refresh token to `response` as an httpOnly cookie."""
    cookie_kwargs = {
        'key': REFRESH_COOKIE_NAME,
        'value': str(refresh_token),
        'max_age': int(_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        'httponly': True,
        'secure': REFRESH_COOKIE_SECURE,
        'samesite': REFRESH_COOKIE_SAMESITE,
        'path': REFRESH_COOKIE_PATH,
    }
    if REFRESH_COOKIE_DOMAIN:
        cookie_kwargs['domain'] = REFRESH_COOKIE_DOMAIN
    response.set_cookie(**cookie_kwargs)


def clear_refresh_cookie(response):
    """Remove the refresh cookie, e.g. on logout or a failed refresh."""
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH, domain=REFRESH_COOKIE_DOMAIN)
