from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import Client, TestCase, override_settings
from django.urls import reverse

from map_api.models import EvacPlan, RegistrationCodeWord

User = get_user_model()


@override_settings(AUTH_PASSWORD_VALIDATORS=[])
class FrontViewsTests(TestCase):
    def setUp(self):
        super().setUp()
        self.client = Client()
        RegistrationCodeWord.objects.update_or_create(
            pk=RegistrationCodeWord.SOLO_PK,
            defaults={"word": "secret"},
        )

    def test_main_lists_only_active_plans(self):
        EvacPlan.objects.create(title="Active", floor=1, image="plans/a.png", is_active=True)
        EvacPlan.objects.create(title="Hidden", floor=2, image="plans/b.png", is_active=False)
        response = self.client.get(reverse("main"))
        self.assertEqual(response.status_code, 200)
        titles = [p.title for p in response.context["plans"]]
        self.assertEqual(titles, ["Active"])

    def test_public_pages_render(self):
        for name in ("evac_plans", "faq"):
            response = self.client.get(reverse(name))
            self.assertEqual(response.status_code, 200)

    def test_tour_view_passes_auth_flags(self):
        response = self.client.get(reverse("tour_view", kwargs={"plan_id": 7}))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["plan_id"], 7)
        self.assertFalse(response.context["is_auth"])
        self.assertFalse(response.context["is_staff"])

    def test_admin_editor_requires_staff(self):
        response = self.client.get(reverse("admin"))
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("admin_login"), response.url)

        staff = User.objects.create_user(
            username="staff",
            email="staff@example.com",
            password="pass12345",
            is_staff=True,
        )
        self.client.force_login(staff)
        response = self.client.get(reverse("admin"))
        self.assertEqual(response.status_code, 200)

    def test_admin_login_redirects_staff_to_admin(self):
        staff = User.objects.create_user(
            username="staff2",
            email="staff2@example.com",
            password="pass12345",
            is_staff=True,
        )
        self.client.force_login(staff)
        response = self.client.get(reverse("admin_login"))
        self.assertRedirects(response, reverse("admin"))

    def test_register_redirects_authenticated_user(self):
        user = User.objects.create_user(
            username="u1",
            email="u1@example.com",
            password="pass12345",
        )
        self.client.force_login(user)
        response = self.client.get(reverse("register"))
        self.assertRedirects(response, reverse("main"))

    def test_register_success_logs_in_and_redirects(self):
        response = self.client.post(
            reverse("register"),
            {
                "email": "new@example.com",
                "password1": "StrongPass123!@#",
                "password2": "StrongPass123!@#",
                "code_word": "secret",
            },
        )
        self.assertRedirects(response, reverse("main"))
        user = User.objects.get(email="new@example.com")
        self.assertTrue(user.check_password("StrongPass123!@#"))

    def test_login_success_and_failure(self):
        User.objects.create_user(
            username="login_user",
            email="login@example.com",
            password="SecretPass123!",
        )
        bad = self.client.post(
            reverse("login"),
            {"email": "login@example.com", "password": "wrong"},
        )
        self.assertEqual(bad.status_code, 200)

        ok = self.client.post(
            reverse("login"),
            {"email": "login@example.com", "password": "SecretPass123!"},
        )
        self.assertRedirects(ok, reverse("main"))

    def test_login_redirects_authenticated_user(self):
        user = User.objects.create_user(
            username="logged",
            email="logged@example.com",
            password="pass12345",
        )
        self.client.force_login(user)
        response = self.client.get(reverse("login"))
        self.assertRedirects(response, reverse("main"))

    def test_superadmin_pages_require_superuser(self):
        staff = User.objects.create_user(
            username="staff3",
            email="staff3@example.com",
            password="pass12345",
            is_staff=True,
        )
        self.client.force_login(staff)
        response = self.client.get(reverse("users_list"))
        self.assertEqual(response.status_code, 302)

        superuser = User.objects.create_superuser(
            username="root",
            email="root@example.com",
            password="pass12345",
        )
        self.client.force_login(superuser)
        response = self.client.get(reverse("users_list"))
        self.assertEqual(response.status_code, 200)
        response = self.client.get(reverse("user_edit", kwargs={"user_id": staff.id}))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["user_id"], staff.id)

    def test_is_admin_and_is_superadmin_helpers(self):
        from front.views import is_admin, is_superadmin

        anon = type("U", (), {"is_authenticated": False})()
        staff = User.objects.create_user(
            username="helper_staff",
            email="helper_staff@example.com",
            password="pass12345",
            is_staff=True,
        )
        superuser = User.objects.create_superuser(
            username="helper_root",
            email="helper_root@example.com",
            password="pass12345",
        )
        self.assertFalse(is_admin(anon))
        self.assertTrue(is_admin(staff))
        self.assertFalse(is_superadmin(staff))
        self.assertTrue(is_superadmin(superuser))
