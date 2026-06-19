#!/bin/bash
# Этап 2: Nginx reverse proxy (+ HTTPS при наличии домена)
#
#   export VPS_IP='168.222.203.122'
#   export MAP_DOMAIN=''                    # опционально: map.example.com
#   bash stage2-bootstrap.sh

set -euo pipefail

VPS_IP="${VPS_IP:?export VPS_IP='x.x.x.x'}"
MAP_DOMAIN="${MAP_DOMAIN:-}"
APP_DIR="${APP_DIR:-/opt/map}"
NGINX_SITE="/etc/nginx/sites-available/map"

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  echo "Запустите от deploy, не root"
  exit 1
fi

SERVER_NAMES="$VPS_IP"
if [[ -n "$MAP_DOMAIN" ]]; then
  SERVER_NAMES="$MAP_DOMAIN $VPS_IP"
fi

echo "==> Установка Nginx"
sudo apt-get update -qq
sudo apt-get install -y nginx

echo "==> Конфиг Nginx (server_name: $SERVER_NAMES)"
sudo tee "$NGINX_SITE" > /dev/null <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $SERVER_NAMES;

    client_max_body_size 100M;

    location /static/ {
        alias ${APP_DIR}/staticfiles/;
        expires 30d;
        add_header Cache-Control "public";
    }

    location /media/ {
        alias ${APP_DIR}/media/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF

sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/map
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo "==> Docker: web только на localhost:8000"
cd "$APP_DIR"

# Обновить ports в compose если ещё 0.0.0.0
if grep -q '0.0.0.0:8000:8000' docker-compose.yml 2>/dev/null; then
  sed -i 's|"8000:8000"|"127.0.0.1:8000:8000"|' docker-compose.yml
  sed -i 's|0.0.0.0:8000:8000|127.0.0.1:8000:8000|' docker-compose.yml
fi

docker compose --profile localdb up -d

echo "==> Firewall: закрыть 8000, оставить 80/443"
for num in $(sudo ufw status numbered | grep '8000/tcp' | sed -n 's/^\[\([0-9]*\)\].*/\1/p' | sort -rn); do
  echo y | sudo ufw delete "$num"
done

if [[ -n "$MAP_DOMAIN" ]]; then
  echo "==> TLS (Let's Encrypt) для $MAP_DOMAIN"
  sudo apt-get install -y certbot python3-certbot-nginx
  sudo certbot --nginx -d "$MAP_DOMAIN" --non-interactive --agree-tos -m "admin@${MAP_DOMAIN}" || {
    echo "Certbot не смог выпустить сертификат. Проверьте DNS A-запись → $VPS_IP"
    echo "Повторите позже: sudo certbot --nginx -d $MAP_DOMAIN"
  }
  if grep -q "CSRF_TRUSTED_ORIGINS" "$APP_DIR/.env" 2>/dev/null; then
    if ! grep -q "https://${MAP_DOMAIN}" "$APP_DIR/.env"; then
      echo "CSRF_TRUSTED_ORIGINS=https://${MAP_DOMAIN}" >> "$APP_DIR/.env"
      docker compose --profile localdb up -d
    fi
  else
    echo "CSRF_TRUSTED_ORIGINS=https://${MAP_DOMAIN}" >> "$APP_DIR/.env"
    docker compose --profile localdb up -d
  fi
fi

echo ""
echo "=========================================="
echo " Этап 2 завершён"
echo "=========================================="
curl -sI "http://${VPS_IP}/" | head -5 || true
echo ""
if [[ -n "$MAP_DOMAIN" ]]; then
  echo " Сайт:  https://${MAP_DOMAIN}"
else
  echo " Сайт:  http://${VPS_IP}  (порт 80, без :8000)"
  echo " HTTPS: задайте MAP_DOMAIN и перезапустите скрипт, или:"
  echo "   sudo certbot --nginx -d your.domain.com"
fi
