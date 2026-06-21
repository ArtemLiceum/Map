from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import exceptions
from rest_framework.test import APIRequestFactory

from map_api.jwt import EmailTokenObtainPairSerializer

User = get_user_model()


class EmailTokenObtainPairSerializerTests(TestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            username="jwt_user",
            email="jwt@example.com",
            password="SecretPass123!",
        )
        self.factory = APIRequestFactory()
        self.request = self.factory.post("/api/token/")

    def _validate(self, email: str, password: str):
        serializer = EmailTokenObtainPairSerializer(context={"request": self.request})
        return serializer.validate({"email": email, "password": password})

    def test_validate_returns_access_and_refresh_tokens(self):
        data = self._validate("jwt@example.com", "SecretPass123!")
        self.assertIn("access", data)
        self.assertIn("refresh", data)
        self.assertTrue(data["access"])
        self.assertTrue(data["refresh"])

    def test_validate_rejects_wrong_password(self):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self._validate("jwt@example.com", "wrong")

    def test_validate_rejects_unknown_email(self):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self._validate("missing@example.com", "SecretPass123!")
