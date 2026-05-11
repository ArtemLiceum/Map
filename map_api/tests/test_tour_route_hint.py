import shutil
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from map_api.models import (
    EvacPlan,
    MapPoint,
    Panorama,
    PanoramaMarker,
    Tour,
    TourInfoMarkerView,
    TourMarker,
)

User = get_user_model()


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage")
class TourRouteHintAPITests(APITestCase):
    def _png(self, name: str = "img.png") -> SimpleUploadedFile:
        from PIL import Image
        import io

        buf = io.BytesIO()
        Image.new("RGB", (2, 2), (255, 0, 0)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

    def setUp(self):
        super().setUp()
        self._tmp_media = tempfile.mkdtemp(prefix="test_media_hint_")
        self.addCleanup(lambda: shutil.rmtree(self._tmp_media, ignore_errors=True))

        with patch("django.conf.settings.MEDIA_ROOT", self._tmp_media):
            self.user = User.objects.create_user(
                username="hintuser",
                email="h@example.com",
                password="pass12345",
            )
            self.plan = EvacPlan.objects.create(title="P", floor=1, image=self._png("plan.png"))
            self.p1 = MapPoint.objects.create(plan=self.plan, name="A", x=0, y=0)
            self.p2 = MapPoint.objects.create(plan=self.plan, name="B", x=1, y=1)
            self.pano1 = Panorama.objects.create(point=self.p1, image=self._png("a.png"))
            self.pano2 = Panorama.objects.create(point=self.p2, image=self._png("b.png"))
            self.info = PanoramaMarker.objects.create(
                panorama=self.pano1,
                azimuth=0,
                type=PanoramaMarker.MarkerType.INFO,
                label="i",
                text="t",
            )
            PanoramaMarker.objects.create(
                panorama=self.pano2,
                target_point=self.p1,
                azimuth=90,
                type=PanoramaMarker.MarkerType.TRANSITION,
            )
            self.tour = Tour.objects.create(plan=self.plan, title="T", is_active=True)
            TourMarker.objects.create(tour=self.tour, marker=self.info)

    def _hint_url(self, tour_id: int) -> str:
        return f"/api/tours/{tour_id}/route-hint/"

    def test_route_hint_requires_auth(self):
        url = self._hint_url(self.tour.id)
        resp = self.client.get(url, {"from_point": self.p2.id})
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_route_hint_success_shortest_to_unvisited(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self._hint_url(self.tour.id), {"from_point": self.p2.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertTrue(data["found"])
        self.assertEqual(data["end_point_id"], self.p1.id)
        self.assertEqual(data["path"], [self.p2.id, self.p1.id])
        self.assertEqual(len(data["steps"]), 1)

    def test_route_hint_all_viewed(self):
        self.client.force_authenticate(self.user)
        TourInfoMarkerView.objects.create(user=self.user, tour=self.tour, marker=self.info)
        resp = self.client.get(self._hint_url(self.tour.id), {"from_point": self.p2.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertFalse(data["found"])
        self.assertIn("просмотрены", data.get("detail", ""))

    def test_route_hint_missing_from_point(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self._hint_url(self.tour.id))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
