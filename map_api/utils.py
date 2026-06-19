import io
import os
import json
from typing import Optional

from django.core.files.base import ContentFile
from PIL import Image


def _detect_format(img: Image.Image, fallback: str = "PNG") -> str:
    fmt = img.format or fallback
    upper = fmt.upper()
    if upper == "JPG":
        return "JPEG"
    return upper


def apply_crop(uploaded_file, crop_data: Optional[dict], preferred_name: Optional[str] = None):
    """
    Apply crop to an uploaded file using Pillow.
    `crop_data` expects x, y, width, height, rotate (optional), scaleX/scaleY (optional).
    Returns a new ContentFile ready to be saved.
    """
    if not crop_data:
        return uploaded_file

    # Ensure numeric values and sane defaults
    try:
        x = float(crop_data.get("x", 0))
        y = float(crop_data.get("y", 0))
        w = float(crop_data.get("width", 0))
        h = float(crop_data.get("height", 0))
        rotate = float(crop_data.get("rotate", 0))
    except (TypeError, ValueError):
        return uploaded_file

    if w <= 0 or h <= 0:
        return uploaded_file

    # Load image
    img = Image.open(uploaded_file)
    img.load()

    if rotate:
        # Cropper.js uses clockwise degrees; Pillow rotates counter-clockwise
        img = img.rotate(-rotate, expand=True)

    width, height = img.size
    left = max(0, int(round(x)))
    top = max(0, int(round(y)))
    right = min(width, int(round(x + w)))
    bottom = min(height, int(round(y + h)))

    if right <= left or bottom <= top:
        return uploaded_file

    img = img.crop((left, top, right, bottom))

    fmt = _detect_format(img, fallback="PNG")
    buffer = io.BytesIO()

    if fmt == "JPEG":
        img = img.convert("RGB")
        img.save(buffer, format=fmt, quality=95, optimize=True)
        ext = ".jpg"
    else:
        img.save(buffer, format=fmt, optimize=True)
        ext = f".{fmt.lower()}"

    name = preferred_name or getattr(uploaded_file, "name", f"cropped{ext}")
    base, _ = os.path.splitext(name)
    final_name = f"{base}_cropped{ext}"
    return ContentFile(buffer.getvalue(), name=final_name)


def parse_crop_data(raw_value: Optional[str]) -> Optional[dict]:
    if not raw_value:
        return None
    try:
        return json.loads(raw_value)
    except Exception:
        return None
