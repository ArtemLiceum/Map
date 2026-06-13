#!/bin/bash
# Этап 0: базовая настройка VPS для Map
# Запуск: от root на сервере (через VNC или SSH)
#
#   export DEPLOY_SSH_PUBKEY='ssh-ed25519 AAAA... user@host'
#   bash stage0-bootstrap.sh
#
# Или одной строкой:
#   DEPLOY_SSH_PUBKEY="$(cat ~/.ssh/id_ed25519.pub)" bash stage0-bootstrap.sh

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Запустите скрипт от root: sudo bash $0"
  exit 1
fi

if [[ -z "${DEPLOY_SSH_PUBKEY:-}" ]]; then
  echo "Укажите публичный SSH-ключ:"
  echo "  export DEPLOY_SSH_PUBKEY='ssh-ed25519 AAAA...'"
  exit 1
fi

HOSTNAME="${HOSTNAME_TARGET:-map-prod-01}"
TIMEZONE="${TIMEZONE_TARGET:-Europe/Moscow}"

echo "==> 0.1 Обновление системы"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
timedatectl set-timezone "$TIMEZONE"
hostnamectl set-hostname "$HOSTNAME"

echo "==> 0.2 Пользователь deploy"
if ! id deploy &>/dev/null; then
  adduser --disabled-password --gecos "Map deploy" deploy
fi
usermod -aG sudo deploy

install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "$DEPLOY_SSH_PUBKEY" > /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys

echo "==> 0.3 Hardening SSH"
SSHD="/etc/ssh/sshd_config"
cp "$SSHD" "${SSHD}.bak.$(date +%Y%m%d)"

set_sshd() {
  local key="$1" val="$2"
  if grep -qE "^#?${key}[[:space:]]" "$SSHD"; then
    sed -i -E "s/^#?${key}.*/${key} ${val}/" "$SSHD"
  else
    echo "${key} ${val}" >> "$SSHD"
  fi
}

set_sshd "PermitRootLogin" "no"
set_sshd "PasswordAuthentication" "no"
set_sshd "PubkeyAuthentication" "yes"

systemctl restart ssh || systemctl restart sshd

echo "==> 0.4 Firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> 0.5 Swap 2 GB"
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl -p /etc/sysctl.d/99-swappiness.conf

echo "==> 0.6 Лимит journald"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/size.conf <<'EOF'
[Journal]
SystemMaxUse=100M
MaxRetentionSec=7day
EOF
systemctl restart systemd-journald

echo ""
echo "=========================================="
echo " Этап 0 завершён"
echo "=========================================="
echo " Hostname:  $(hostname)"
echo " Timezone:  $(timedatectl show -p Timezone --value)"
echo ""
ufw status verbose
echo ""
free -h
echo ""
echo " С локальной машины проверьте:"
echo "   ssh deploy@<VPS_IP> 'hostname && ufw status && free -h'"
echo ""
echo " VNC можно закрыть после успешного SSH."
