import io
import json

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image

from map_api.utils import apply_crop, parse_crop_data


class ParseCropDataTests(TestCase):
    def test_none_returns_none(self):
        self.assertIsNone(parse_crop_data(None))
        self.assertIsNone(parse_crop_data(""))

    def test_invalid_json_returns_none(self):
        self.assertIsNone(parse_crop_data("not-json"))

    def test_valid_json(self):
        payload = {"x": 1, "y": 2, "width": 10, "height": 20}
        self.assertEqual(parse_crop_data(json.dumps(payload)), payload)


class ApplyCropTests(TestCase):
    def _png(self, size=(20, 10), color=(255, 0, 0)) -> SimpleUploadedFile:
        buf = io.BytesIO()
        Image.new("RGB", size, color).save(buf, format="PNG")
        return SimpleUploadedFile("test.png", buf.getvalue(), content_type="image/png")

    def test_no_crop_data_returns_original(self):
        uploaded = self._png()
        result = apply_crop(uploaded, None)
        self.assertIs(result, uploaded)

    def test_invalid_crop_values_return_original(self):
        uploaded = self._png()
        result = apply_crop(uploaded, {"x": "bad", "y": 0, "width": 5, "height": 5})
        self.assertIs(result, uploaded)

    def test_zero_dimensions_return_original(self):
        uploaded = self._png()
        result = apply_crop(uploaded, {"x": 0, "y": 0, "width": 0, "height": 5})
        self.assertIs(result, uploaded)

    def test_valid_crop_produces_smaller_image(self):
        uploaded = self._png(size=(20, 10))
        result = apply_crop(uploaded, {"x": 2, "y": 1, "width": 8, "height": 4})
        self.assertNotEqual(result, uploaded)
        self.assertTrue(result.name.endswith("_cropped.png"))
        img = Image.open(io.BytesIO(result.read()))
        self.assertEqual(img.size, (8, 4))

    def test_crop_with_rotation(self):
        uploaded = self._png(size=(10, 20))
        result = apply_crop(uploaded, {"x": 0, "y": 0, "width": 10, "height": 10, "rotate": 90})
        img = Image.open(io.BytesIO(result.read()))
        self.assertEqual(img.size, (10, 10))

    def test_invalid_crop_bounds_return_original(self):
        uploaded = self._png(size=(10, 10))
        result = apply_crop(uploaded, {"x": 10, "y": 10, "width": 5, "height": 5})
        self.assertIs(result, uploaded)

    def test_jpeg_source_can_be_cropped(self):
        buf = io.BytesIO()
        Image.new("RGB", (12, 8), (0, 255, 0)).save(buf, format="JPEG")
        uploaded = SimpleUploadedFile("photo.jpg", buf.getvalue(), content_type="image/jpeg")
        result = apply_crop(uploaded, {"x": 0, "y": 0, "width": 6, "height": 4})
        self.assertIn("_cropped", result.name)
        img = Image.open(io.BytesIO(result.read()))
        self.assertEqual(img.size, (6, 4))

    def test_detect_format_normalizes_jpg(self):
        from map_api.utils import _detect_format

        img = Image.new("RGB", (2, 2))
        img.format = "JPG"
        self.assertEqual(_detect_format(img), "JPEG")
