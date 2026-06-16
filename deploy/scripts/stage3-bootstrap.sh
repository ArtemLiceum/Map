#!/bin/bash
# Этап 3: MinIO (S3) для медиафайлов
#
#   export MAP_DOMAIN='ab46.tech'
#   bash stage3-bootstrap.sh

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/map}"
MAP_DOMAIN="${MAP_DOMAIN:-ab46.tech}"

cd "$APP_DIR"

gen_secret() { openssl rand -base64 24 | tr -d '/+=' | head -c 24; }

echo "==> Добавление S3-переменных в .env"
touch .env
chmod 600 .env

get_env() { grep -E "^${1}=" .env 2>/dev/null | cut -d= -f2- || true; }

MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-$(get_env MINIO_ROOT_PASSWORD)}"
if [[ -z "$MINIO_ROOT_PASSWORD" ]]; then MINIO_ROOT_PASSWORD=$(gen_secret); fi

AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-$(get_env AWS_ACCESS_KEY_ID)}"
if [[ -z "$AWS_ACCESS_KEY_ID" ]]; then AWS_ACCESS_KEY_ID="mapapp"; fi

AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-$(get_env AWS_SECRET_ACCESS_KEY)}"
if [[ -z "$AWS_SECRET_ACCESS_KEY" ]]; then AWS_SECRET_ACCESS_KEY=$(gen_secret); fi

set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}

set_env USE_S3 1
set_env MINIO_ROOT_USER minioadmin
set_env MINIO_ROOT_PASSWORD "$MINIO_ROOT_PASSWORD"
set_env AWS_ACCESS_KEY_ID "$AWS_ACCESS_KEY_ID"
set_env AWS_SECRET_ACCESS_KEY "$AWS_SECRET_ACCESS_KEY"
set_env AWS_STORAGE_BUCKET_NAME map-media
set_env AWS_S3_ENDPOINT_URL "http://minio:9000"
set_env AWS_S3_REGION_NAME us-east-1

echo "==> Запуск MinIO + пересборка web"
docker compose --profile localdb up --build -d

echo "==> Ожидание minio-init"
sleep 8
docker compose --profile localdb logs minio-init --tail 5

echo "==> Nginx: MinIO Console (minio.${MAP_DOMAIN})"
MINIO_CONF="/etc/nginx/sites-available/minio-console"
if [[ ! -f "$MINIO_CONF" ]]; then
  sudo tee "$MINIO_CONF" > /dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name minio.${MAP_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF
  sudo ln -sf "$MINIO_CONF" /etc/nginx/sites-enabled/minio-console
  sudo nginx -t && sudo systemctl reload nginx

  if command -v certbot &>/dev/null; then
    sudo certbot --nginx -d "minio.${MAP_DOMAIN}" --non-interactive --agree-tos \
      -m "admin@${MAP_DOMAIN}" --redirect 2>/dev/null || \
      echo "Добавьте DNS A-запись minio.${MAP_DOMAIN} → VPS IP, затем:"
    echo "  sudo certbot --nginx -d minio.${MAP_DOMAIN}"
  fi
fi

echo ""
echo "=========================================="
echo " Этап 3 завершён"
echo "=========================================="
docker compose --profile localdb ps
echo ""
echo " MinIO Console: https://minio.${MAP_DOMAIN} (или SSH-туннель :9001)"
echo "   Login: minioadmin / см. MINIO_ROOT_PASSWORD в .env"
echo ""
echo " Проверка: загрузите панораму в админке → объект в bucket map-media"
