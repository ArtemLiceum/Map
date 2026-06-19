from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
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


class UserViewSetTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.superuser = User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="adminpass123",
        )
        self.user = User.objects.create_user(
            username="u1",
            email="u1@example.com",
            password="oldpass123",
        )
        self.other_user = User.objects.create_user(
            username="u2",
            email="u2@example.com",
            password="pass12345",
        )

    def _set_password_url(self, user_id: int) -> str:
        return f"/api/users/{user_id}/set-password/"

    def _tour_progress_url(self, user_id: int, plan_id: int | None = None) -> str:
        url = f"/api/users/{user_id}/tour-progress/"
        if plan_id is not None:
            url += f"?plan={plan_id}"
        return url

    def test_set_password_requires_superuser(self):
        # unauthenticated
        resp = self.client.post(
            self._set_password_url(self.user.id),
            data={"new_password": "NewPass123!@", "new_password_confirm": "NewPass123!@"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

        # authenticated but not superuser
        self.client.force_authenticate(self.other_user)
        resp2 = self.client.post(
            self._set_password_url(self.user.id),
            data={"new_password": "NewPass123!@", "new_password_confirm": "NewPass123!@"},
            format="json",
        )
        self.assertEqual(resp2.status_code, status.HTTP_403_FORBIDDEN)

    def test_set_password_success_updates_password(self):
        self.client.force_authenticate(self.superuser)

        resp = self.client.post(
            self._set_password_url(self.user.id),
            data={"new_password": "NewPass123!@", "new_password_confirm": "NewPass123!@"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, {"detail": "Пароль обновлён."})

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass123!@"))

    def test_set_password_validation_error_on_mismatch(self):
        self.client.force_authenticate(self.superuser)

        resp = self.client.post(
            self._set_password_url(self.user.id),
            data={"new_password": "NewPass123!@", "new_password_confirm": "Different123!@"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password_confirm", resp.data)

    def test_tour_progress_requires_superuser(self):
        resp = self.client.get(self._tour_progress_url(self.user.id))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(self.other_user)
        resp2 = self.client.get(self._tour_progress_url(self.user.id))
        self.assertEqual(resp2.status_code, status.HTTP_403_FORBIDDEN)

    def test_tour_progress_returns_progress_and_plan_filter(self):
        # Plan 1 with two info markers and 1 viewed
        plan1 = EvacPlan.objects.create(
            title="A Plan",
            floor=1,
            image=SimpleUploadedFile("p1.jpg", b"fake", content_type="image/jpeg"),
        )
        p1 = MapPoint.objects.create(plan=plan1, name="P1", x=10, y=10)
        pano1 = Panorama.objects.create(
            point=p1,
            image=SimpleUploadedFile("pano1.jpg", b"fake", content_type="image/jpeg"),
        )
        info1 = PanoramaMarker.objects.create(
            panorama=pano1,
            azimuth=10,
            pitch=0,
            label="I1",
            text="t",
            type=PanoramaMarker.MarkerType.INFO,
        )
        info2 = PanoramaMarker.objects.create(
            panorama=pano1,
            azimuth=20,
            pitch=0,
            label="I2",
            text="t",
            type=PanoramaMarker.MarkerType.INFO,
        )
        tour1 = Tour.objects.create(plan=plan1, title="Tour 1", is_active=True)
        TourMarker.objects.create(tour=tour1, marker=info1)
        TourMarker.objects.create(tour=tour1, marker=info2)
        view = TourInfoMarkerView.objects.create(user=self.user, tour=tour1, marker=info1)
        TourInfoMarkerView.objects.filter(pk=view.pk).update(viewed_at=timezone.now())

        # Plan 2 to ensure ?plan filter works
        plan2 = EvacPlan.objects.create(
            title="B Plan",
            floor=2,
            image=SimpleUploadedFile("p2.jpg", b"fake", content_type="image/jpeg"),
        )
        p2 = MapPoint.objects.create(plan=plan2, name="P2", x=20, y=20)
        pano2 = Panorama.objects.create(
            point=p2,
            image=SimpleUploadedFile("pano2.jpg", b"fake", content_type="image/jpeg"),
        )
        info3 = PanoramaMarker.objects.create(
            panorama=pano2,
            azimuth=30,
            pitch=0,
            label="I3",
            text="t",
            type=PanoramaMarker.MarkerType.INFO,
        )
        tour2 = Tour.objects.create(plan=plan2, title="Tour 2", is_active=True)
        TourMarker.objects.create(tour=tour2, marker=info3)

        self.client.force_authenticate(self.superuser)

        resp = self.client.get(self._tour_progress_url(self.user.id))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsInstance(resp.data, list)
        self.assertEqual(len(resp.data), 2)

        row1 = next(r for r in resp.data if r["tour"] == tour1.id)
        self.assertEqual(row1["plan"], plan1.id)
        self.assertEqual(row1["plan_title"], plan1.title)
        self.assertEqual(row1["tour_title"], tour1.title)
        self.assertEqual(row1["viewed"], 1)
        self.assertEqual(row1["total"], 2)
        self.assertEqual(row1["percent"], 50)
        self.assertIsNotNone(row1["last_viewed_at"])

        # Filter by plan1 should return only tour1
        resp2 = self.client.get(self._tour_progress_url(self.user.id, plan_id=plan1.id))
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp2.data), 1)
        self.assertEqual(resp2.data[0]["tour"], tour1.id)

