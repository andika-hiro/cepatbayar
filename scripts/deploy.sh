#!/usr/bin/env bash
# Build and deploy Cepatkan Bayar to the already-provisioned cPanel app.
# Run scripts/provision.sh once, first, before ever running this.
#
# What this does NOT touch: the server's .env (never uploaded/overwritten —
# it's created once during provisioning and left alone on every redeploy so
# a deploy can never accidentally wipe production secrets).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_USER="andikah1"
REMOTE_HOST="103.59.160.21"
REMOTE_PORT="22"
SSH_KEY="$HOME/.ssh/id_ed25519_nyanhosting"
DOMAIN="cb.andikahiro.my.id"
APP_ROOT="/home/${REMOTE_USER}/${DOMAIN}"
STAGING_DIR="$(mktemp -d)"

cleanup() { rm -rf "$STAGING_DIR"; }
trap cleanup EXIT

echo "==> Building (root 'npm run build': client -> server -> copies client/dist into server/public)"
(cd "$REPO_ROOT" && npm run build)

echo "==> Staging deploy artifacts in $STAGING_DIR"
cp -r "$REPO_ROOT/server/dist" "$STAGING_DIR/dist"
cp -r "$REPO_ROOT/server/public" "$STAGING_DIR/public"
cp "$REPO_ROOT/server/package.json" "$STAGING_DIR/package.json"
cp "$REPO_ROOT/server/package-lock.json" "$STAGING_DIR/package-lock.json"

echo "==> Uploading to ${REMOTE_HOST}:${APP_ROOT} (scp -r, rsync is not available on this host)"
scp -i "$SSH_KEY" -P "$REMOTE_PORT" -r "$STAGING_DIR/dist" "${REMOTE_USER}@${REMOTE_HOST}:${APP_ROOT}/dist.new"
scp -i "$SSH_KEY" -P "$REMOTE_PORT" -r "$STAGING_DIR/public" "${REMOTE_USER}@${REMOTE_HOST}:${APP_ROOT}/public.new"
scp -i "$SSH_KEY" -P "$REMOTE_PORT" "$STAGING_DIR/package.json" "$STAGING_DIR/package-lock.json" "${REMOTE_USER}@${REMOTE_HOST}:${APP_ROOT}/"

echo "==> Swapping in new dist/public, installing production deps, restarting on the server"
ssh -i "$SSH_KEY" -p "$REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout=10 "${REMOTE_USER}@${REMOTE_HOST}" "bash -s" <<REMOTE_SCRIPT
set -eo pipefail
cd "${APP_ROOT}"
rm -rf dist.old public.old
[ -d dist ] && mv dist dist.old || true
[ -d public ] && mv public public.old || true
mv dist.new dist
mv public.new public

# The nodevenv activate script isn't set-u-safe (references an unbound var
# internally) — confirmed by hitting this directly on first deploy, so -u is
# dropped for this whole remote script rather than guessed around.
source /home/${REMOTE_USER}/nodevenv/${DOMAIN}/22/bin/activate
npm install --omit=dev
deactivate

mkdir -p tmp
touch tmp/restart.txt
echo "Restart triggered."
REMOTE_SCRIPT

echo "==> Waiting for Passenger to pick up the restart"
sleep 5

echo "==> Verifying"
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/api/health" || echo "FAILED")
ROOT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/" || echo "FAILED")
echo "GET /api/health -> ${HEALTH_STATUS}"
echo "GET /            -> ${ROOT_STATUS}"

if [ "$HEALTH_STATUS" = "200" ] && [ "$ROOT_STATUS" = "200" ]; then
  echo "==> Deployed successfully: https://${DOMAIN}"
else
  echo "==> WARNING: verification did not return 200/200 — check https://${DOMAIN}/logs or stderr.log on the server before trusting this deploy."
  exit 1
fi
