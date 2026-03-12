#!/bin/bash
# SchedKit — Plesk post-deployment script
set -e

APP_DIR="/var/www/vhosts/schedkit.net/httpdocs"
GIT_DIR_BARE="/var/www/vhosts/schedkit.net/git/p7-scheduler.git"
NODE="/opt/plesk/node/22/bin/node"
NPM="/opt/plesk/node/22/bin/npm"
PM2_HOME="/var/www/vhosts/schedkit.net/.pm2"
PM2_BIN=$(find /var/www/vhosts/schedkit.net -name "pm2" -path "*/bin/pm2" -not -path "*/logrotate*" 2>/dev/null | head -1)

export HOME="/var/www/vhosts/schedkit.net"
export PM2_HOME

cd "$APP_DIR"

# Write current commit SHA
NEW_SHA=$(GIT_DIR="$GIT_DIR_BARE" git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "$NEW_SHA" > "$APP_DIR/.git-sha"
echo "[deploy] SHA: $NEW_SHA"

echo "[deploy] Installing dependencies..."
"$NPM" install --prefer-offline

echo "[deploy] Restarting app via pm2..."
if "$NODE" "$PM2_BIN" list 2>/dev/null | grep -q schedkit; then
  "$NODE" "$PM2_BIN" restart schedkit --update-env
else
  "$NODE" "$PM2_BIN" start src/index.mjs --name schedkit --interpreter "$NODE"
  "$NODE" "$PM2_BIN" save
fi

echo "[deploy] Done. App is live."
