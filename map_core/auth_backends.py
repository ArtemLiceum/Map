from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


UserModel = get_user_model()


class EmailBackend(ModelBackend):
    """
    Authenticate using email (case-insensitive).
    Also accepts username if it looks like an email for backward compatibility.
    """

    def authenticate(self, request, username=None, email=None, password=None, **kwargs):
        login_email = email or username
        if not login_email or not password:
            return None

        try:
            user = UserModel.objects.get(email__iexact=login_email.strip())
        except UserModel.DoesNotExist:
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
