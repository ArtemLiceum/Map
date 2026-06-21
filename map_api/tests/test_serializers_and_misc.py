import io
import json
import shutil
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from map_api.models import (
    EvacPlan,
    Facility,
    MapPoint,
    Panorama,
    PanoramaMarker,
    RegistrationCodeWord,
    Tour,
    TourInfoMarkerView,
    TourMarker,
)
from map_api.serializers import (
    EvacPlanSerializer,
    MapPointSerializer,
    PanoramaMarkerSerializer,
    TourSerializer,
    UserAdminSerializer,
    UserSetPasswordSerializer,
)

User = get_user_model()


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage")
class SerializerValidationTests(APITestCase):
    def _png(self, name: str = "img.png") -> SimpleUploadedFile:
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (2, 2), (255, 0, 0)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

    def setUp(self):
        super().setUp()
        self._tmp_media = tempfile.mkdtemp(prefix="test_media_serializers_")
        self.addCleanup(lambda: shutil.rmtree(self._tmp_media, ignore_errors=True))

        with patch("django.conf.settings.MEDIA_ROOT", self._tmp_media):
            self.plan = EvacPlan.objects.create(
                title="Plan",
                floor=1,
                image=self._png("plan.png"),
            )
            self.point_a = MapPoint.objects.create(plan=self.plan, name="A", x=0, y=0)
            self.point_b = MapPoint.objects.create(plan=self.plan, name="B", x=10, y=10)
            self.pano = Panorama.objects.create(point=self.point_a, image=self._png("pano.png"))
            self.tour = Tour.objects.create(plan=self.plan, title="Tour 1", is_active=True)

    def test_map_point_clamps_coordinates(self):
        serializer = MapPointSerializer()
        self.assertEqual(serializer.validate_x(150), 100)
        self.assertEqual(serializer.validate_y(-5), 0)

    def test_evac_plan_start_point_validation(self):
        serializer = EvacPlanSerializer()
        with self.assertRaises(Exception):
            serializer.validate_start_point(self.point_a)

        other_plan = EvacPlan.objects.create(title="Other", floor=2, image=self._png("o.png"))
        foreign = MapPoint.objects.create(plan=other_plan, name="X", x=1, y=1)
        serializer = EvacPlanSerializer(instance=self.plan)
        with self.assertRaises(Exception):
            serializer.validate_start_point(foreign)

        self.assertEqual(serializer.validate_start_point(self.point_a), self.point_a)

    def test_transition_marker_requires_target_point(self):
        serializer = PanoramaMarkerSerializer(
            data={
                "panorama": self.pano.id,
                "type": PanoramaMarker.MarkerType.TRANSITION,
                "azimuth": 10,
                "pitch": 0,
                "label": "go",
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("target_point", serializer.errors)

    def test_info_marker_rejects_target_point(self):
        serializer = PanoramaMarkerSerializer(
            data={
                "panorama": self.pano.id,
                "type": PanoramaMarker.MarkerType.INFO,
                "azimuth": 10,
                "pitch": 0,
                "label": "info",
                "text": "hello",
                "target_point": self.point_b.id,
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("target_point", serializer.errors)

    def test_transition_marker_rejects_tours(self):
        serializer = PanoramaMarkerSerializer(
            data={
                "panorama": self.pano.id,
                "type": PanoramaMarker.MarkerType.TRANSITION,
                "target_point": self.point_b.id,
                "azimuth": 10,
                "pitch": 0,
                "label": "go",
                "tours": [self.tour.id],
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("tours", serializer.errors)

    def test_info_marker_rejects_tour_from_other_plan(self):
        other_plan = EvacPlan.objects.create(title="P2", floor=2, image=self._png("p2.png"))
        other_tour = Tour.objects.create(plan=other_plan, title="Other tour", is_active=True)
        serializer = PanoramaMarkerSerializer(
            data={
                "panorama": self.pano.id,
                "type": PanoramaMarker.MarkerType.INFO,
                "azimuth": 10,
                "pitch": 0,
                "label": "info",
                "text": "hello",
                "tours": [other_tour.id],
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("tours", serializer.errors)

    def test_tour_progress_for_anonymous_user_is_zero(self):
        info = PanoramaMarker.objects.create(
            panorama=self.pano,
            type=PanoramaMarker.MarkerType.INFO,
            azimuth=1,
            pitch=0,
            label="i",
            text="t",
        )
        TourMarker.objects.create(tour=self.tour, marker=info)
        request = type("R", (), {"user": type("U", (), {"is_authenticated": False})()})()
        serializer = TourSerializer(self.tour, context={"request": request})
        self.assertEqual(serializer.data["progress_viewed"], 0)
        self.assertEqual(serializer.data["progress_total"], 1)

    def test_tour_progress_counts_viewed_markers(self):
        user = User.objects.create_user(username="viewer", email="v@example.com", password="pass12345")
        info = PanoramaMarker.objects.create(
            panorama=self.pano,
            type=PanoramaMarker.MarkerType.INFO,
            azimuth=1,
            pitch=0,
            label="i",
            text="t",
        )
        TourMarker.objects.create(tour=self.tour, marker=info)
        TourInfoMarkerView.objects.create(user=user, tour=self.tour, marker=info)
        request = type("R", (), {"user": user})()
        serializer = TourSerializer(self.tour, context={"request": request})
        self.assertEqual(serializer.data["progress_viewed"], 1)
        self.assertEqual(serializer.data["progress_percent"], 100)

    def test_user_admin_serializer_blocks_last_superuser_demotion(self):
        superuser = User.objects.create_superuser(
            username="only_root",
            email="root@example.com",
            password="pass12345",
        )
        serializer = UserAdminSerializer(
            instance=superuser,
            data={"is_superuser": False},
            partial=True,
        )
        self.assertFalse(serializer.is_valid())

    def test_user_set_password_serializer_checks_match(self):
        user = User.objects.create_user(username="pw", email="pw@example.com", password="oldpass123")
        serializer = UserSetPasswordSerializer(
            data={"new_password": "NewPass123!", "new_password_confirm": "Mismatch123!"},
            context={"user": user},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("new_password_confirm", serializer.errors)


class ModelValidationTests(APITestCase):
    def _png(self, name: str = "img.png") -> SimpleUploadedFile:
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (2, 2), (255, 0, 0)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

    def setUp(self):
        super().setUp()
        self._tmp_media = tempfile.mkdtemp(prefix="test_media_models_")
        self.addCleanup(lambda: shutil.rmtree(self._tmp_media, ignore_errors=True))

        with patch("django.conf.settings.MEDIA_ROOT", self._tmp_media):
            self.plan = EvacPlan.objects.create(title="Plan", floor=1, image=self._png("plan.png"))
            self.point = MapPoint.objects.create(plan=self.plan, name="A", x=0, y=0)
            self.pano = Panorama.objects.create(point=self.point, image=self._png("pano.png"))
            self.tour = Tour.objects.create(plan=self.plan, title="Tour", is_active=True)

    def test_evac_plan_clean_rejects_foreign_start_point(self):
        other_plan = EvacPlan.objects.create(title="Other", floor=2, image=self._png("o.png"))
        foreign = MapPoint.objects.create(plan=other_plan, name="F", x=1, y=1)
        self.plan.start_point = foreign
        with self.assertRaises(ValidationError):
            self.plan.clean()

    def test_tour_marker_rejects_transition_marker(self):
        transition = PanoramaMarker.objects.create(
            panorama=self.pano,
            target_point=self.point,
            type=PanoramaMarker.MarkerType.TRANSITION,
            azimuth=10,
            pitch=0,
            label="go",
        )
        tm = TourMarker(tour=self.tour, marker=transition)
        with self.assertRaises(ValidationError):
            tm.clean()

    def test_tour_info_marker_view_requires_tour_membership(self):
        info = PanoramaMarker.objects.create(
            panorama=self.pano,
            type=PanoramaMarker.MarkerType.INFO,
            azimuth=1,
            pitch=0,
            label="i",
            text="t",
        )
        user = User.objects.create_user(username="u", email="u@example.com", password="pass12345")
        view = TourInfoMarkerView(user=user, tour=self.tour, marker=info)
        with self.assertRaises(ValidationError):
            view.clean()

    def test_registration_code_word_get_solo(self):
        RegistrationCodeWord.objects.all().delete()
        self.assertIsNone(RegistrationCodeWord.get_solo())
        RegistrationCodeWord.objects.create(pk=RegistrationCodeWord.SOLO_PK, word="abc")
        self.assertEqual(RegistrationCodeWord.get_solo().word, "abc")


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage")
class MiscApiTests(APITestCase):
    def _png(self, name: str = "img.png") -> SimpleUploadedFile:
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (2, 2), (255, 0, 0)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

    def setUp(self):
        super().setUp()
        self._tmp_media = tempfile.mkdtemp(prefix="test_media_misc_")
        self.addCleanup(lambda: shutil.rmtree(self._tmp_media, ignore_errors=True))

        self.superuser = User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="adminpass123",
        )
        self.staff = User.objects.create_user(
            username="staff",
            email="staff@example.com",
            password="pass12345",
            is_staff=True,
        )

        with patch("django.conf.settings.MEDIA_ROOT", self._tmp_media):
            self.facility = Facility.objects.create(title="F")
            self.plan = EvacPlan.objects.create(
                title="Plan",
                floor=1,
                image=self._png("plan.png"),
                facility=self.facility,
                is_active=True,
            )
            self.hidden_plan = EvacPlan.objects.create(
                title="Hidden",
                floor=9,
                image=self._png("hidden.png"),
                facility=self.facility,
                is_active=False,
            )
            self.point = MapPoint.objects.create(plan=self.plan, name="A", x=0, y=0)
            self.pano = Panorama.objects.create(point=self.point, image=self._png("pano.png"))

    def test_registration_code_word_api(self):
        RegistrationCodeWord.objects.update_or_create(
            pk=RegistrationCodeWord.SOLO_PK,
            defaults={"word": "old"},
        )
        self.client.force_authenticate(user=self.superuser)
        get_resp = self.client.get("/api/registration-code/")
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(get_resp.data["word"], "old")

        post_resp = self.client.post("/api/registration-code/")
        self.assertEqual(post_resp.status_code, status.HTTP_200_OK)
        self.assertNotEqual(post_resp.data["word"], "old")

    def test_groups_and_permissions_list_for_superuser(self):
        group = Group.objects.create(name="Editors")
        perm = Permission.objects.first()
        self.client.force_authenticate(user=self.superuser)

        groups_resp = self.client.get("/api/groups/")
        self.assertEqual(groups_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(any(g["name"] == "Editors" for g in groups_resp.data))

        perms_resp = self.client.get("/api/permissions/?search=auth")
        self.assertEqual(perms_resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(perms_resp.data), 1)

    def test_evac_plan_list_filters_and_hides_inactive_for_anon(self):
        response = self.client.get(f"/api/evac_plans/?search=Plan&facility={self.facility.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [p["title"] for p in response.data]
        self.assertIn("Plan", titles)
        self.assertNotIn("Hidden", titles)

    def test_evac_plan_route_validation_errors(self):
        response = self.client.get(f"/api/evac_plans/{self.plan.id}/route/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.get(
            f"/api/evac_plans/{self.plan.id}/route/?start_point=abc&end_point=1"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_map_points_filter_by_plan(self):
        other_plan = EvacPlan.objects.create(title="Other", floor=2, image=self._png("o.png"))
        MapPoint.objects.create(plan=other_plan, name="B", x=1, y=1)
        response = self.client.get(f"/api/map_points/?plan={self.plan.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "A")

    def test_panorama_create_replaces_existing_for_point(self):
        self.client.force_authenticate(user=self.staff)
        first = self.client.post(
            "/api/panoramas/",
            {"point": self.point.id, "image": self._png("first.png")},
            format="multipart",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post(
            "/api/panoramas/",
            {"point": self.point.id, "image": self._png("second.png")},
            format="multipart",
        )
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Panorama.objects.filter(point=self.point).count(), 1)

    def test_facility_detail_hides_inactive_plans_for_anon(self):
        response = self.client.get(f"/api/facilities/{self.facility.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [p["title"] for p in response.data["plans"]]
        self.assertIn("Plan", titles)
        self.assertNotIn("Hidden", titles)

    def test_user_search_and_tour_progress(self):
        self.client.force_authenticate(user=self.superuser)
        search_resp = self.client.get("/api/users/?search=admin")
        self.assertEqual(search_resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(search_resp.data), 1)

        tour = Tour.objects.create(plan=self.plan, title="Progress tour", is_active=True)
        progress_resp = self.client.get(f"/api/users/{self.staff.id}/tour-progress/?plan={self.plan.id}")
        self.assertEqual(progress_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(any(row["tour"] == tour.id for row in progress_resp.data))
