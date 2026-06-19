from os import getenv
from datetime import timedelta


# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = getenv(
    "SECRET_KEY", "django-insecure-v!l)$=@vw!j-on&2%t&k#&yr^)%ixj+-11um)1du-hajdw4+!p"
)
# SALT KEY for Fernet
SALT_KEY = getenv("SALT_KEY", "nokfroadq56bhz5kolqf5v5fy4olv32k")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = getenv("DEBUG", "True") == "True"

# DATABASE CONNECTION
DB_ENGINE = getenv("DB_ENGINE", "django.db.backends.postgresql_psycopg2")
DB_NAME = getenv("DB_NAME")
DB_USER = getenv("DB_USER")
DB_PASSWORD = getenv("DB_PASSWORD")
DB_HOST = getenv("DB_HOST")
DB_PORT = getenv("DB_PORT")
DB_SSLMODE = getenv("DB_SSLMODE")

# SimpleJWT settings
ACCESS_TOKEN_LIFETIME = timedelta(minutes=int(getenv("ACCESS_TOKEN_LIFETIME", 5)))
REFRESH_TOKEN_LIFETIME = timedelta(
    minutes=int(getenv("REFRESH_TOKEN_LIFETIME", 60 * 24))
)
SIGNING_KEY = getenv("SIGNING_KEY", SECRET_KEY)
UPDATE_LAST_LOGIN = getenv("UPDATE_LAST_LOGIN", "True") == "True"
ROTATE_REFRESH_TOKENS = getenv("ROTATE_REFRESH_TOKENS", "True") == "True"
BLACKLIST_AFTER_ROTATION = getenv("BLACKLIST_AFTER_ROTATION", "False") == "True"

# S3 / MinIO (optional)
USE_S3 = getenv("USE_S3", "0") == "1"
AWS_ACCESS_KEY_ID = getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_STORAGE_BUCKET_NAME = getenv("AWS_STORAGE_BUCKET_NAME", "map-media")
AWS_S3_ENDPOINT_URL = getenv("AWS_S3_ENDPOINT_URL", "")
AWS_S3_PUBLIC_ENDPOINT_URL = getenv("AWS_S3_PUBLIC_ENDPOINT_URL", "")
AWS_S3_REGION_NAME = getenv("AWS_S3_REGION_NAME", "us-east-1")
