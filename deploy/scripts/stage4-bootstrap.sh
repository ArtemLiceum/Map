#!/bin/bash
# Этап 4: подготовка VPS к деплою из GitHub Container Registry
#
# Однократно на сервере (от deploy):
#   bash stage4-bootstrap.sh
#
# Затем в GitHub → Settings → Secrets → Actions добавьте:
#   VPS_HOST, VPS_SSH_KEY, GHCR_PULL_TOKEN

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/map}"
IMAGE="ghcr.io/artemliceum/map:latest"

cd "$APP_DIR"

echo "==> MAP_WEB_IMAGE в .env"
if grep -q '^MAP_WEB_IMAGE=' .env 2>/dev/null; then
  sed -i "s|^MAP_WEB_IMAGE=.*|MAP_WEB_IMAGE=${IMAGE}|" .env
else
  echo "MAP_WEB_IMAGE=${IMAGE}" >> .env
fi

echo "==> Git remote для pull конфигов"
if [[ -d .git ]]; then
  git remote -v
else
  echo "Репозиторий не git-клон — рекомендуется: git clone https://github.com/ArtemLiceum/Map.git ${APP_DIR}"
fi

echo ""
echo "=========================================="
echo " Этап 4 — подготовка сервера завершена"
echo "=========================================="
echo ""
echo " Добавьте секреты в GitHub (Settings → Secrets → Actions):"
echo ""
echo "  VPS_HOST          = ab46.tech  (или 168.222.203.122)"
echo "  VPS_SSH_KEY       = приватный ключ deploy (cat ~/.ssh/id_ed25519)"
echo "  GHCR_PULL_TOKEN   = GitHub PAT с read:packages"
echo ""
echo " Сделайте пакет ghcr.io/artemliceum/map публичным (если репо private):"
echo "  GitHub → Packages → map → Package settings → Change visibility"
echo ""
echo " После push в dev — Actions соберёт образ и задеплоит."
echo " Проверка на сервере:"
echo "   docker compose --profile localdb ps"
echo "   docker compose images web"
