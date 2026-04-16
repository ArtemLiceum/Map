import json
import shutil
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from map_api.models import EvacPlan, MapPoint, Panorama


User = get_user_model()


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage")
class PanoramaViewSetTests(APITestCase):
    def _png(self, name: str = "img.png") -> SimpleUploadedFile:
        # DRF ImageField validates actual image bytes
        from PIL import Image
        import io

        buf = io.BytesIO()
        Image.new("RGB", (2, 2), (255, 0, 0)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

    def setUp(self):
        super().setUp()
        self._tmp_media = tempfile.mkdtemp(prefix="test_media_")
        self.addCleanup(lambda: shutil.rmtree(self._tmp_media, ignore_errors=True))

        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="pass12345",
            is_staff=True,
        )
        self.user = User.objects.create_user(
            username="u1",
            email="u1@example.com",
            password="pass12345",
            is_staff=False,
        )

        self.plan = EvacPlan.objects.create(
            title="Plan",
            floor=1,
            image=self._png("plan.png"),
        )
        self.point = MapPoint.objects.create(plan=self.plan, name="P1", x=10, y=10)

    def _list_url(self) -> str:
        return "/api/panoramas/"

    def _detail_url(self, pano_id: int) -> str:
        return f"/api/panoramas/{pano_id}/"

    def test_create_requires_admin(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            self._list_url(),
            data={
                "point": self.point.id,
                "image": self._png("p.png"),
            },
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_replaces_existing_panorama_for_point(self):
        with override_settings(MEDIA_ROOT=self._tmp_media):
            self.client.force_authenticate(self.admin)

            p1 = Panorama.objects.create(
                point=self.point,
                image=SimpleUploadedFile("old.jpg", b"old", content_type="image/jpeg"),
            )
            old_name = p1.image.name
            self.assertTrue(default_storage.exists(old_name))

            resp = self.client.post(
                self._list_url(),
                data={
                    "point": self.point.id,
                    "image": self._png("new.png"),
                },
                format="multipart",
            )
            self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

            self.assertEqual(Panorama.objects.filter(point=self.point).count(), 1)
            new_pano = Panorama.objects.get(point=self.point)
            self.assertNotEqual(new_pano.id, p1.id)
            self.assertFalse(default_storage.exists(old_name))

    def test_update_with_crop_uses_existing_image_and_replaces_file(self):
        with override_settings(MEDIA_ROOT=self._tmp_media):
            self.client.force_authenticate(self.admin)

            pano = Panorama.objects.create(
                point=self.point,
                image=SimpleUploadedFile("orig.jpg", b"orig", content_type="image/jpeg"),
            )
            old_name = pano.image.name
            self.assertTrue(default_storage.exists(old_name))

            crop = json.dumps({"x": 0, "y": 0, "width": 10, "height": 10, "rotate": 0})
            cropped_file = ContentFile(b"cropped", name="cropped.jpg")

            with patch("map_api.views.apply_crop", return_value=cropped_file) as apply_crop_mock:
                resp = self.client.patch(
                    self._detail_url(pano.id),
                    data={"crop": crop},
                    format="json",
                )

            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            apply_crop_mock.assert_called_once()

            pano.refresh_from_db()
            self.assertNotEqual(pano.image.name, old_name)
            self.assertFalse(default_storage.exists(old_name))
            self.assertTrue(default_storage.exists(pano.image.name))

