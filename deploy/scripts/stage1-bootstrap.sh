#!/bin/bash
# Этап 1: Docker + первый запуск Map
# Запуск на VPS от пользователя deploy (после этапа 0):
#
#   export VPS_IP='1.2.3.4'                    # публичный IP сервера
#   export GIT_REPO='https://github.com/ArtemLiceum/Map.git'
#   bash stage1-bootstrap.sh
#
# Для приватного репозитория — сначала настройте deploy key или PAT на сервере.

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  echo "Запустите от пользователя deploy, не root:"
  echo "  su - deploy"
  echo "  bash stage1-bootstrap.sh"
  exit 1
fi

VPS_IP="${VPS_IP:?Укажите VPS_IP, например: export VPS_IP='1.2.3.4'}"
GIT_REPO="${GIT_REPO:-https://github.com/ArtemLiceum/Map.git}"
APP_DIR="${APP_DIR:-/opt/map}"

echo "==> 1.1 Установка Docker"
if ! command -v docker &>/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo usermod -aG docker "$USER"
  echo ""
  echo "Docker установлен. Если команда docker выдаёт 'permission denied', выполните:"
  echo "  newgrp docker"
  echo "и снова запустите этот скрипт."
  exit 0
fi

if ! docker info &>/dev/null; then
  echo "Нет доступа к Docker. Выполните: newgrp docker"
  echo "Затем снова: bash stage1-bootstrap.sh"
  exit 1
fi

echo "==> 1.2 Клонирование проекта в ${APP_DIR}"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone "$GIT_REPO" "$APP_DIR"
else
  echo "Репозиторий уже есть, git pull..."
  git -C "$APP_DIR" pull --ff-only
fi

cd "$APP_DIR"

echo "==> 1.3 Создание .env"
if [[ ! -f .env ]]; then
  DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
  SECRET_KEY=$(openssl rand -base64 48 | tr -d '/+=' | head -c 50)
  SIGNING_KEY=$(openssl rand -base64 48 | tr -d '/+=' | head -c 50)

  cat > .env <<EOF
DEBUG=False
SECRET_KEY=${SECRET_KEY}
ALLOWED_HOSTS=${VPS_IP},localhost,127.0.0.1

DB_ENGINE=django.db.backends.postgresql
DB_HOST=db
DB_PORT=5432
DB_NAME=map_db
DB_USER=map_user
DB_PASSWORD=${DB_PASSWORD}

SIGNING_KEY=${SIGNING_KEY}
ACCESS_TOKEN_LIFETIME=480
REFRESH_TOKEN_LIFETIME=600
ROTATE_REFRESH_TOKENS=True
BLACKLIST_AFTER_ROTATION=False
UPDATE_LAST_LOGIN=True

GUNICORN_WORKERS=2
EOF
  chmod 600 .env
  echo ".env создан (пароли сгенерированы автоматически)."
else
  echo ".env уже существует — не перезаписываем."
  # Убедимся, что IP в ALLOWED_HOSTS (settings пока использует *, но на будущее)
  grep -q "DB_HOST=db" .env || echo "Внимание: для localdb нужен DB_HOST=db в .env"
fi

mkdir -p media staticfiles

echo "==> 1.4 Firewall: временно открыть порт 8000"
sudo ufw allow 8000/tcp comment 'Map app (этап 1, закрыть на этапе 2)'

echo "==> 1.5 Сборка и запуск (это займёт несколько минут)"
docker compose --profile localdb up --build -d

echo ""
echo "Ожидание готовности web..."
for i in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:8000" 2>/dev/null; then
    echo "Приложение отвечает."
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "Таймаут. Смотрите логи: docker compose logs web --tail 50"
    exit 1
  fi
  sleep 5
done

echo ""
echo "=========================================="
echo " Этап 1 — контейнеры запущены"
echo "=========================================="
docker compose --profile localdb ps
echo ""
free -h
echo ""
echo " Откройте в браузере:  http://${VPS_IP}:8000"
echo " Админка:               http://${VPS_IP}:8000/admin/"
echo ""
echo " Создайте администратора:"
echo "   cd ${APP_DIR} && docker compose exec web python manage.py createsuperuser"
echo ""
echo " Логи:"
echo "   docker compose logs -f web"
