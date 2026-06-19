import io
import shutil
import tempfile
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from map_api.models import EvacPlan, Facility, MapPoint, Panorama, PanoramaMarker


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage")
class CrossPlanTransitionFacilityValidationTests(APITestCase):
    def _png(self, name: str = "img.png") -> SimpleUploadedFile:
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (2, 2), (255, 0, 0)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

    def setUp(self):
        super().setUp()
        self._tmp_media = tempfile.mkdtemp(prefix="test_media_transition_facility_")
        self.addCleanup(lambda: shutil.rmtree(self._tmp_media, ignore_errors=True))

        self.staff = User.objects.create_user(
            username="staff",
            email="staff@example.com",
            password="pass",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.staff)

        with patch("django.conf.settings.MEDIA_ROOT", self._tmp_media):
            self.f1 = Facility.objects.create(title="F1")
            self.f2 = Facility.objects.create(title="F2")

            self.plan_f1_a = EvacPlan.objects.create(
                title="P-F1-A",
                floor=1,
                image=self._png("p_f1_a.png"),
                facility=self.f1,
            )
            self.plan_f1_b = EvacPlan.objects.create(
                title="P-F1-B",
                floor=2,
                image=self._png("p_f1_b.png"),
                facility=self.f1,
            )
            self.plan_f2 = EvacPlan.objects.create(
                title="P-F2",
                floor=1,
                image=self._png("p_f2.png"),
                facility=self.f2,
            )
            self.plan_null = EvacPlan.objects.create(
                title="P-NULL",
                floor=9,
                image=self._png("p_null.png"),
                facility=None,
            )

            # Source point and panorama (plan_f1_a)
            self.src = MapPoint.objects.create(plan=self.plan_f1_a, name="SRC", x=0, y=0)
            self.pano = Panorama.objects.create(point=self.src, image=self._png("src_pano.png"))

            # Targets
            self.t_same_facility = MapPoint.objects.create(
                plan=self.plan_f1_b, name="T-SAME-F", x=10, y=10
            )
            self.t_other_facility = MapPoint.objects.create(
                plan=self.plan_f2, name="T-OTHER-F", x=20, y=20
            )
            self.t_null_facility = MapPoint.objects.create(
                plan=self.plan_null, name="T-NULL-F", x=30, y=30
            )

            # Same-plan null facility case (should be allowed)
            self.null_src = MapPoint.objects.create(plan=self.plan_null, name="N-SRC", x=1, y=1)
            self.null_pano = Panorama.objects.create(point=self.null_src, image=self._png("null_src.png"))
            self.null_target_same_plan = MapPoint.objects.create(
                plan=self.plan_null, name="N-T", x=2, y=2
            )

    def _create_transition(self, *, panorama_id: int, target_point_id: int):
        return self.client.post(
            "/api/panorama_markers/",
            {
                "panorama": panorama_id,
                "target_point": target_point_id,
                "azimuth": 10,
                "pitch": 0,
                "type": PanoramaMarker.MarkerType.TRANSITION,
                "label": "go",
                "text": "",
                "tours": [],
            },
            format="json",
        )

    def test_cross_plan_transition_other_facility_rejected(self):
        resp = self._create_transition(
            panorama_id=self.pano.id,
            target_point_id=self.t_other_facility.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        data = resp.json()
        self.assertIn("target_point", data)

    def test_cross_plan_transition_null_facility_rejected(self):
        resp = self._create_transition(
            panorama_id=self.pano.id,
            target_point_id=self.t_null_facility.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        data = resp.json()
        self.assertIn("target_point", data)

    def test_cross_plan_transition_same_facility_allowed(self):
        resp = self._create_transition(
            panorama_id=self.pano.id,
            target_point_id=self.t_same_facility.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        data = resp.json()
        self.assertEqual(data["target_point"], self.t_same_facility.id)

    def test_same_plan_transition_allowed_even_without_facility(self):
        resp = self._create_transition(
            panorama_id=self.null_pano.id,
            target_point_id=self.null_target_same_plan.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_update_transition_to_other_facility_rejected(self):
        created = self._create_transition(
            panorama_id=self.pano.id,
            target_point_id=self.t_same_facility.id,
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        marker_id = created.json()["id"]

        resp = self.client.patch(
            f"/api/panorama_markers/{marker_id}/",
            {"target_point": self.t_other_facility.id},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
