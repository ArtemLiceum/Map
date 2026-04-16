from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from front.forms import EmailRegistrationForm
from map_api.models import RegistrationCodeWord


User = get_user_model()


@override_settings(AUTH_PASSWORD_VALIDATORS=[])
class EmailRegistrationFormTests(TestCase):
    def setUp(self):
        super().setUp()
        RegistrationCodeWord.objects.update_or_create(
            pk=RegistrationCodeWord.SOLO_PK,
            defaults={"word": "secret"},
        )

    def test_clean_email_rejects_existing_user_email_case_insensitive(self):
        User.objects.create_user(username="u1", email="TeSt@Example.com", password="pass12345")

        form = EmailRegistrationForm(
            data={
                "email": "test@example.com",
                "password1": "StrongPass123!@#",
                "password2": "StrongPass123!@#",
                "code_word": "secret",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("email", form.errors)
        self.assertEqual(form.errors["email"], ["Пользователь с таким email уже существует."])

    def test_clean_code_word_required(self):
        form = EmailRegistrationForm(
            data={
                "email": "new@example.com",
                "password1": "StrongPass123!@#",
                "password2": "StrongPass123!@#",
                "code_word": "   ",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("code_word", form.errors)
        # Field-level required validation runs before clean_code_word()
        self.assertEqual(form.errors["code_word"], ["This field is required."])

    def test_clean_code_word_not_configured(self):
        RegistrationCodeWord.objects.all().delete()
        form = EmailRegistrationForm(
            data={
                "email": "new@example.com",
                "password1": "StrongPass123!@#",
                "password2": "StrongPass123!@#",
                "code_word": "secret",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("code_word", form.errors)
        self.assertEqual(
            form.errors["code_word"],
            [
                "Регистрация временно недоступна: кодовое слово не настроено. Обратитесь к администратору."
            ],
        )

    def test_clean_code_word_wrong(self):
        form = EmailRegistrationForm(
            data={
                "email": "new@example.com",
                "password1": "StrongPass123!@#",
                "password2": "StrongPass123!@#",
                "code_word": "wrong",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("code_word", form.errors)
        self.assertEqual(form.errors["code_word"], ["Неверное кодовое слово."])

    def test_clean_rejects_password_mismatch(self):
        form = EmailRegistrationForm(
            data={
                "email": "new@example.com",
                "password1": "StrongPass123!@#",
                "password2": "OtherPass123!@#",
                "code_word": "secret",
            }
        )
        self.assertFalse(form.is_valid())
        # non-field validation error is attached to password2 as dict in clean()
        self.assertIn("password2", form.errors)
        self.assertEqual(form.errors["password2"], ["Пароли не совпадают."])

    def test_save_normalizes_email_and_generates_unique_username(self):
        # occupy base username to force suffix
        User.objects.create_user(username="test", email="occupied@example.com", password="pass12345")

        form = EmailRegistrationForm(
            data={
                "email": "  TEST@Example.com ",
                "password1": "StrongPass123!@#",
                "password2": "StrongPass123!@#",
                "code_word": "secret",
            }
        )
        self.assertTrue(form.is_valid(), msg=form.errors.as_json())

        user = form.save()
        self.assertEqual(user.email, "test@example.com")
        self.assertEqual(user.username, "test_1")
        self.assertTrue(User.objects.filter(pk=user.pk).exists())
        self.assertTrue(user.check_password("StrongPass123!@#"))

