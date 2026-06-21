import io
import shutil
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from map_api.models import EvacPlan, Facility

User = get_user_model()


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage")
class EvacPlanVisibilityTests(APITestCase):
    def _png(self, name: str = "img.png") -> SimpleUploadedFile:
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (2, 2), (255, 0, 0)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

    def setUp(self):
        super().setUp()
        self._tmp_media = tempfile.mkdtemp(prefix="test_media_evac_visibility_")
        self.addCleanup(lambda: shutil.rmtree(self._tmp_media, ignore_errors=True))

        self.staff = User.objects.create_user(
            username="staff_vis",
            email="staff_vis@example.com",
            password="pass",
            is_staff=True,
        )
        self.user = User.objects.create_user(
            username="user_vis",
            email="user_vis@example.com",
            password="pass",
        )

        with patch("django.conf.settings.MEDIA_ROOT", self._tmp_media):
            self.facility = Facility.objects.create(title="Facility Vis")
            self.active_plan = EvacPlan.objects.create(
                title="Active Plan",
                floor=1,
                image=self._png("active.png"),
                facility=self.facility,
                is_active=True,
            )
            self.inactive_plan = EvacPlan.objects.create(
                title="Inactive Plan",
                floor=2,
                image=self._png("inactive.png"),
                facility=self.facility,
                is_active=False,
            )

    def _list_url(self) -> str:
        return "/api/evac_plans/"

    def _detail_url(self, plan_id: int) -> str:
        return f"/api/evac_plans/{plan_id}/"

    def _facility_url(self, facility_id: int) -> str:
        return f"/api/facilities/{facility_id}/"

    def _plan_ids(self, response) -> set[int]:
        data = response.json()
        items = data if isinstance(data, list) else data.get("results", [])
        return {item["id"] for item in items}

    def test_anonymous_list_only_active_plans(self):
        response = self.client.get(self._list_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self._plan_ids(response)
        self.assertIn(self.active_plan.id, ids)
        self.assertNotIn(self.inactive_plan.id, ids)

    def test_staff_list_includes_inactive_plans(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(self._list_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self._plan_ids(response)
        self.assertIn(self.active_plan.id, ids)
        self.assertIn(self.inactive_plan.id, ids)

    def test_anonymous_cannot_retrieve_inactive_plan(self):
        response = self.client.get(self._detail_url(self.inactive_plan.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_staff_can_retrieve_inactive_plan(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(self._detail_url(self.inactive_plan.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.json()["is_active"])

    def test_staff_can_hide_plan(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.patch(
            self._detail_url(self.active_plan.id),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.json()["is_active"])
        self.active_plan.refresh_from_db()
        self.assertFalse(self.active_plan.is_active)

    def test_regular_user_cannot_patch_is_active(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self._detail_url(self.active_plan.id),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.active_plan.refresh_from_db()
        self.assertTrue(self.active_plan.is_active)

    def test_facility_detail_hides_inactive_plans_for_anonymous(self):
        response = self.client.get(self._facility_url(self.facility.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        plan_ids = {plan["id"] for plan in response.json()["plans"]}
        self.assertIn(self.active_plan.id, plan_ids)
        self.assertNotIn(self.inactive_plan.id, plan_ids)

    def test_facility_detail_includes_inactive_plans_for_staff(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(self._facility_url(self.facility.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        plan_ids = {plan["id"] for plan in response.json()["plans"]}
        self.assertIn(self.active_plan.id, plan_ids)
        self.assertIn(self.inactive_plan.id, plan_ids)
