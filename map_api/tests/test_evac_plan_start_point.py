import io
import shutil
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from map_api.models import EvacPlan, MapPoint, Panorama

User = get_user_model()


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage")
class EvacPlanStartPointTests(APITestCase):
    def _png(self, name: str = "img.png") -> SimpleUploadedFile:
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (2, 2), (255, 0, 0)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

    def setUp(self):
        super().setUp()
        self._tmp_media = tempfile.mkdtemp(prefix="test_media_start_point_")
        self.addCleanup(lambda: shutil.rmtree(self._tmp_media, ignore_errors=True))

        self.staff = User.objects.create_user(
            username="staff_start",
            email="staff_start@example.com",
            password="pass",
            is_staff=True,
        )

        with patch("django.conf.settings.MEDIA_ROOT", self._tmp_media):
            self.plan = EvacPlan.objects.create(
                title="Plan Start",
                floor=1,
                image=self._png("plan.png"),
            )
            self.other_plan = EvacPlan.objects.create(
                title="Other Plan",
                floor=2,
                image=self._png("other.png"),
            )
            self.point_a = MapPoint.objects.create(plan=self.plan, name="A", x=10, y=10)
            self.point_b = MapPoint.objects.create(plan=self.plan, name="B", x=50, y=50)
            self.foreign_point = MapPoint.objects.create(
                plan=self.other_plan, name="Foreign", x=0, y=0
            )
            Panorama.objects.create(point=self.point_a, image=self._png("a.png"))
            Panorama.objects.create(point=self.point_b, image=self._png("b.png"))

    def _detail_url(self, plan_id: int) -> str:
        return f"/api/evac_plans/{plan_id}/"

    def test_get_plan_includes_start_point(self):
        self.plan.start_point = self.point_b
        self.plan.save(update_fields=["start_point"])

        resp = self.client.get(self._detail_url(self.plan.id))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["start_point"], self.point_b.id)

    def test_patch_start_point_by_staff(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.patch(
            self._detail_url(self.plan.id),
            {"start_point": self.point_b.id},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["start_point"], self.point_b.id)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.start_point_id, self.point_b.id)

    def test_patch_start_point_null_clears(self):
        self.plan.start_point = self.point_a
        self.plan.save(update_fields=["start_point"])
        self.client.force_authenticate(self.staff)

        resp = self.client.patch(
            self._detail_url(self.plan.id),
            {"start_point": None},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data["start_point"])
        self.plan.refresh_from_db()
        self.assertIsNone(self.plan.start_point_id)

    def test_patch_start_point_foreign_plan_rejected(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.patch(
            self._detail_url(self.plan.id),
            {"start_point": self.foreign_point.id},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.plan.refresh_from_db()
        self.assertIsNone(self.plan.start_point_id)

    def test_delete_start_point_map_point_sets_null(self):
        self.plan.start_point = self.point_a
        self.plan.save(update_fields=["start_point"])
        self.client.force_authenticate(self.staff)

        resp = self.client.delete(f"/api/map_points/{self.point_a.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.plan.refresh_from_db()
        self.assertIsNone(self.plan.start_point_id)
