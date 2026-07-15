from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from .views import LogoutView


class LogoutViewTests(SimpleTestCase):
    def test_logout_clears_cookie_for_anonymous_request(self):
        factory = APIRequestFactory()
        request = factory.post('/api/users/logout/')

        response = LogoutView.as_view()(request)

        self.assertEqual(response.status_code, 205)
        self.assertIn('refresh_token', response.cookies)
        self.assertEqual(response.cookies['refresh_token']['max-age'], 0)
