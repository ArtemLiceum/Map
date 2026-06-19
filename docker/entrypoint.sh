#!/bin/sh
set -eu

# Опционально: поднять localtunnel и добавить URL в CSRF_TRUSTED_ORIGINS
if [ "${ENABLE_TUNNEL:-0}" = "1" ] || [ "${ENABLE_TUNNEL:-0}" = "true" ]; then
  echo "Starting localtunnel (port 8000)..."
  : > /tmp/lt.log
  ( npx -y localtunnel --port 8000 2>&1 | tee /tmp/lt.log ) &
  LT_PID=$!
  n=0
  while [ $n -lt 30 ]; do
    if grep -q "your url is:" /tmp/lt.log 2>/dev/null; then
      break
    fi
    n=$(( n + 1 ))
    sleep 1
  done
  if grep -q "your url is:" /tmp/lt.log; then
    TUNNEL_URL=$(grep "your url is:" /tmp/lt.log | sed 's/.*your url is: *//' | tr -d '\r\n')
    if [ -n "${CSRF_TRUSTED_ORIGINS:-}" ]; then
      export CSRF_TRUSTED_ORIGINS="${CSRF_TRUSTED_ORIGINS},${TUNNEL_URL}"
    else
      export CSRF_TRUSTED_ORIGINS="${TUNNEL_URL}"
    fi
    echo "Tunnel URL: ${TUNNEL_URL} (added to CSRF_TRUSTED_ORIGINS)"
  else
    echo "Warning: tunnel URL not found in output (tunnel may still be running)."
  fi
fi

echo "Waiting for database: ${DB_HOST:-localhost}:${DB_PORT:-5432} (db=${DB_NAME:-?}, user=${DB_USER:-?})"

python - <<'PY'
import os
import time

import psycopg2

host = os.environ.get("DB_HOST", "localhost")
port = int(os.environ.get("DB_PORT", "5432"))
name = os.environ["DB_NAME"]
user = os.environ["DB_USER"]
password = os.environ["DB_PASSWORD"]

deadline = time.time() + 60
last_err = None

while time.time() < deadline:
    try:
        conn = psycopg2.connect(
            dbname=name,
            user=user,
            password=password,
            host=host,
            port=port,
        )
        conn.close()
        raise SystemExit(0)
    except Exception as e:
        last_err = e
        time.sleep(1)

raise SystemExit(f"Database is not ready: {last_err}")
PY

echo "Database is ready."

python manage.py migrate --noinput
python manage.py collectstatic --noinput

WORKERS="${GUNICORN_WORKERS:-2}"
exec gunicorn map_core.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "$WORKERS" \
  --timeout 120 \
  --max-requests 1000 \
  --access-logfile - \
  --error-logfile -
