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
scp -i "$SSH_KEY" -P "$REMOTE_PORT" "$STAGING_DIR/package.json" "${REMOTE_USER}@${REMOTE_HOST}:${APP_ROOT}/package.json.new"
scp -i "$SSH_KEY" -P "$REMOTE_PORT" "$STAGING_DIR/package-lock.json" "${REMOTE_USER}@${REMOTE_HOST}:${APP_ROOT}/package-lock.json.new"

echo "==> Swapping in new dist/public, installing production deps if needed, restarting on the server"
ssh -i "$SSH_KEY" -p "$REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout=10 "${REMOTE_USER}@${REMOTE_HOST}" "bash -s" <<REMOTE_SCRIPT
set -eo pipefail
cd "${APP_ROOT}"
rm -rf dist.old public.old
[ -d dist ] && mv dist dist.old || true
[ -d public ] && mv public public.old || true
mv dist.new dist
mv public.new public

# Only run npm install if package-lock.json actually changed. This server's
# npm has been observed to crash outright ("pthread_create: Resource
# temporarily unavailable" — a per-account CloudLinux LVE process/thread
# limit, confirmed by the same crash hitting an already-working sibling app's
# npm too, not something specific to this app) on more than one deploy, so
# skipping the call entirely when it's not needed avoids relying on it.
NEEDS_INSTALL=1
if [ -f package-lock.json ] && cmp -s package-lock.json package-lock.json.new; then
  NEEDS_INSTALL=0
fi
mv package.json.new package.json
mv package-lock.json.new package-lock.json

if [ "\$NEEDS_INSTALL" = "1" ]; then
  echo "package-lock.json changed — running npm install"
  # The nodevenv activate script isn't set-u-safe (references an unbound var
  # internally) — confirmed by hitting this directly on first deploy, so -u
  # is dropped for this whole remote script rather than guessed around.
  source /home/${REMOTE_USER}/nodevenv/${DOMAIN}/22/bin/activate
  if npm install --omit=dev; then
    echo "npm install succeeded."
  else
    echo "WARNING: npm install crashed (known host issue, see comment above)."
    echo "Continuing with the existing node_modules — this is STALE if a"
    echo "dependency actually changed. Retry 'npm install --omit=dev' by hand"
    echo "(source the activate script first) once the host issue clears."
  fi
  deactivate
else
  echo "package-lock.json unchanged — skipping npm install."
fi

mkdir -p tmp
touch tmp/restart.txt
echo "Restart triggered."
REMOTE_SCRIPT

echo "==> Verifying (Passenger can briefly 503 while the new process boots, so this retries)"
HEALTH_STATUS="FAILED"
ROOT_STATUS="FAILED"
for attempt in 1 2 3 4 5 6; do
  sleep 5
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/api/health" || echo "FAILED")
  ROOT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/" || echo "FAILED")
  echo "  attempt ${attempt}: /api/health -> ${HEALTH_STATUS}, / -> ${ROOT_STATUS}"
  if [ "$HEALTH_STATUS" = "200" ] && [ "$ROOT_STATUS" = "200" ]; then
    break
  fi
done

if [ "$HEALTH_STATUS" = "200" ] && [ "$ROOT_STATUS" = "200" ]; then
  echo "==> Deployed successfully: https://${DOMAIN}"
else
  echo "==> WARNING: verification did not return 200/200 after 6 attempts (~30s) — check https://${DOMAIN}/logs or stderr.log on the server before trusting this deploy."
  exit 1
fi
