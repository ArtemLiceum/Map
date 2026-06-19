import io
import shutil
import tempfile
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from map_api.models import EvacPlan, Facility, MapPoint, Panorama, PanoramaMarker


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage")
class FacilityRouteAPITests(APITestCase):
    def _png(self, name: str = "img.png") -> SimpleUploadedFile:
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (2, 2), (255, 0, 0)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

    def setUp(self):
        super().setUp()
        self._tmp_media = tempfile.mkdtemp(prefix="test_media_facility_route_")
        self.addCleanup(lambda: shutil.rmtree(self._tmp_media, ignore_errors=True))

        with patch("django.conf.settings.MEDIA_ROOT", self._tmp_media):
            self.facility = Facility.objects.create(title="F")
            self.plan1 = EvacPlan.objects.create(
                title="P1",
                floor=1,
                image=self._png("p1.png"),
                facility=self.facility,
            )
            self.plan2 = EvacPlan.objects.create(
                title="P2",
                floor=2,
                image=self._png("p2.png"),
                facility=self.facility,
            )
            self.other_facility = Facility.objects.create(title="Other")
            self.other_plan = EvacPlan.objects.create(
                title="OP",
                floor=9,
                image=self._png("op.png"),
                facility=self.other_facility,
            )

            # Plan1 points
            self.a1 = MapPoint.objects.create(plan=self.plan1, name="A1", x=0, y=0)
            self.b1 = MapPoint.objects.create(plan=self.plan1, name="B1", x=50, y=0)
            # Plan2 points
            self.c2 = MapPoint.objects.create(plan=self.plan2, name="C2", x=0, y=0)
            self.d2 = MapPoint.objects.create(plan=self.plan2, name="D2", x=50, y=0)
            # Foreign point
            self.xo = MapPoint.objects.create(plan=self.other_plan, name="XO", x=1, y=1)

            # Panoramas for transition sources
            pano_a1 = Panorama.objects.create(point=self.a1, image=self._png("a1.png"))
            pano_b1 = Panorama.objects.create(point=self.b1, image=self._png("b1.png"))
            pano_c2 = Panorama.objects.create(point=self.c2, image=self._png("c2.png"))

            # Edges: A1 -> B1 (same plan), B1 -> C2 (cross-plan), C2 -> D2 (same plan)
            PanoramaMarker.objects.create(
                panorama=pano_a1,
                target_point=self.b1,
                azimuth=10,
                type=PanoramaMarker.MarkerType.TRANSITION,
            )
            PanoramaMarker.objects.create(
                panorama=pano_b1,
                target_point=self.c2,
                azimuth=20,
                type=PanoramaMarker.MarkerType.TRANSITION,
            )
            PanoramaMarker.objects.create(
                panorama=pano_c2,
                target_point=self.d2,
                azimuth=30,
                type=PanoramaMarker.MarkerType.TRANSITION,
            )

    def _route_url(self, facility_id: int) -> str:
        return f"/api/facilities/{facility_id}/route/"

    def test_facility_route_success_cross_plan(self):
        resp = self.client.get(
            self._route_url(self.facility.id),
            {"start_point": self.a1.id, "end_point": self.d2.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertTrue(data["found"])
        self.assertEqual(data["facility_id"], self.facility.id)
        self.assertEqual(data["path"], [self.a1.id, self.b1.id, self.c2.id, self.d2.id])
        self.assertEqual(len(data["steps"]), 3)
        self.assertIn(str(self.a1.id), data["point_names"])
        self.assertEqual(data["point_plans"][str(self.a1.id)], self.plan1.id)
        self.assertEqual(data["point_plans"][str(self.d2.id)], self.plan2.id)

    def test_facility_route_unreachable(self):
        resp = self.client.get(
            self._route_url(self.facility.id),
            {"start_point": self.d2.id, "end_point": self.a1.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertFalse(data["found"])
        self.assertEqual(data["path"], [])
        self.assertEqual(data["steps"], [])
        self.assertEqual(data["point_names"], {})
        self.assertEqual(data["point_plans"], {})
        self.assertEqual(data["facility_id"], self.facility.id)

    def test_facility_route_missing_params(self):
        resp = self.client.get(self._route_url(self.facility.id), {"start_point": self.a1.id})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_facility_route_invalid_point_ids(self):
        resp = self.client.get(
            self._route_url(self.facility.id),
            {"start_point": "abc", "end_point": self.d2.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_facility_route_points_not_in_facility(self):
        resp = self.client.get(
            self._route_url(self.facility.id),
            {"start_point": self.a1.id, "end_point": self.xo.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_facility_route_facility_not_found(self):
        resp = self.client.get(
            self._route_url(999999),
            {"start_point": self.a1.id, "end_point": self.d2.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

