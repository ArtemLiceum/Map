from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class MapS3Storage(S3Boto3Storage):
    """S3 storage with public URLs via nginx (not internal minio hostname)."""

    def url(self, name, parameters=None, expire=None, http_method=None):
        url = super().url(name, parameters=parameters, expire=expire, http_method=http_method)
        public_base = getattr(settings, "AWS_S3_PUBLIC_ENDPOINT_URL", "")
        internal_base = getattr(settings, "AWS_S3_ENDPOINT_URL", "")
        if public_base and internal_base:
            url = url.replace(internal_base.rstrip("/"), public_base.rstrip("/"))
        return url
