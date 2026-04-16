from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from map_api.models import EvacPlan, MapPoint, Panorama, PanoramaMarker, Tour, TourInfoMarkerView, TourMarker


class TourMarkViewedTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_user(
            username="u1",
            email="u1@example.com",
            password="pass12345",
        )
        self.client.force_authenticate(self.user)

        self.plan = EvacPlan.objects.create(
            title="Plan 1",
            floor=1,
            image=SimpleUploadedFile("plan.jpg", b"fake", content_type="image/jpeg"),
        )
        self.point1 = MapPoint.objects.create(plan=self.plan, name="P1", x=10, y=20)
        self.point2 = MapPoint.objects.create(plan=self.plan, name="P2", x=30, y=40)
        self.panorama1 = Panorama.objects.create(
            point=self.point1,
            image=SimpleUploadedFile("pano.jpg", b"fake", content_type="image/jpeg"),
        )

        self.info_marker_1 = PanoramaMarker.objects.create(
            panorama=self.panorama1,
            azimuth=10,
            pitch=0,
            label="Info 1",
            text="t1",
            type=PanoramaMarker.MarkerType.INFO,
        )
        self.info_marker_2 = PanoramaMarker.objects.create(
            panorama=self.panorama1,
            azimuth=20,
            pitch=0,
            label="Info 2",
            text="t2",
            type=PanoramaMarker.MarkerType.INFO,
        )
        self.transition_marker = PanoramaMarker.objects.create(
            panorama=self.panorama1,
            target_point=self.point2,
            azimuth=30,
            pitch=0,
            label="Go",
            text="",
            type=PanoramaMarker.MarkerType.TRANSITION,
        )

        self.tour = Tour.objects.create(plan=self.plan, title="Tour 1", is_active=True)
        TourMarker.objects.create(tour=self.tour, marker=self.info_marker_1)
        TourMarker.objects.create(tour=self.tour, marker=self.info_marker_2)

    def _url(self, tour_id: int) -> str:
        return f"/api/tours/{tour_id}/mark-viewed/"

    def test_mark_viewed_requires_integer_marker_id(self):
        resp = self.client.post(self._url(self.tour.id), data={"marker_id": "abc"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data, {"detail": "marker_id должен быть целым числом."})

        resp2 = self.client.post(self._url(self.tour.id), data={}, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp2.data, {"detail": "marker_id должен быть целым числом."})

    def test_mark_viewed_marker_not_found(self):
        resp = self.client.post(self._url(self.tour.id), data={"marker_id": 999999}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resp.data, {"detail": "Маркер не найден."})

    def test_mark_viewed_only_info_marker_allowed(self):
        resp = self.client.post(
            self._url(self.tour.id),
            data={"marker_id": self.transition_marker.id},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data, {"detail": "Можно отметить только информационную метку."})

    def test_mark_viewed_marker_must_belong_to_tour(self):
        other_tour = Tour.objects.create(plan=self.plan, title="Tour 2", is_active=True)
        resp = self.client.post(
            self._url(other_tour.id),
            data={"marker_id": self.info_marker_1.id},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data, {"detail": "Эта метка не принадлежит выбранному туру."})

    def test_mark_viewed_success_creates_view_and_returns_progress(self):
        self.assertEqual(TourInfoMarkerView.objects.filter(user=self.user, tour=self.tour).count(), 0)

        resp = self.client.post(
            self._url(self.tour.id),
            data={"marker_id": self.info_marker_1.id},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, {"viewed": 1, "total": 2, "percent": 50})
        self.assertEqual(TourInfoMarkerView.objects.filter(user=self.user, tour=self.tour).count(), 1)

        # idempotent: second call shouldn't create another record
        resp2 = self.client.post(
            self._url(self.tour.id),
            data={"marker_id": self.info_marker_1.id},
            format="json",
        )
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertEqual(resp2.data, {"viewed": 1, "total": 2, "percent": 50})
        self.assertEqual(TourInfoMarkerView.objects.filter(user=self.user, tour=self.tour).count(), 1)

