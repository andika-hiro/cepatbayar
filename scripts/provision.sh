#!/usr/bin/env bash
# One-time provisioning for Cepatkan Bayar on Nyan Hosting cPanel.
#
# Documents the exact commands that were actually run and verified working
# against the real account (2026-08-09) — not a guessed/idealized version.
# Re-running this end-to-end is NOT idempotent-safe: it will error loudly on
# most steps if the subdomain/app/database/user already exist, which is
# intentional (this script is a reference + disaster-recovery aid, not meant
# to be run repeatedly without reading the output).
#
# Two real lessons baked into the exact commands below, learned by trial
# against the live account:
#   - `uapi SubDomain addsubdomain` has NO safe "check required params" dry
#     run — passing minimal params can succeed outright and create a real
#     subdomain. Always pass the final `dir` explicitly, never probe with
#     throwaway values.
#   - `uapi PassengerApps register_application` is NOT what actually powers
#     cPanel's "Setup Node.js App" — it registers app metadata but never
#     generates a working .htaccess (no PassengerNodejs/PassengerAppType/
#     PassengerStartupFile, no nodevenv). The real tool is CloudLinux's
#     `/usr/sbin/cloudlinux-selector` — use `create` for nodejs apps.
#   - `uapi Mysql create_database`/`create_user` both require the FULL
#     account-prefixed name (`andikah1_cb`), not just the suffix (`cb`) —
#     confirmed by the actual error text, not assumed.
set -euo pipefail

REMOTE_USER="andikah1"
REMOTE_HOST="103.59.160.21"
REMOTE_PORT="22"
SSH_KEY="$HOME/.ssh/id_ed25519_nyanhosting"
DOMAIN="cb.andikahiro.my.id"
APP_ROOT="/home/${REMOTE_USER}/${DOMAIN}"
DB_NAME="andikah1_cb"
DB_USER="andikah1_cb"
NODE_VERSION="22"

ssh_run() {
  ssh -i "$SSH_KEY" -p "$REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout=10 "${REMOTE_USER}@${REMOTE_HOST}" "$1"
}

echo "==> 1. Creating subdomain ${DOMAIN}"
ssh_run "uapi --output=jsonpretty SubDomain addsubdomain domain=cb rootdomain=andikahiro.my.id dir=${DOMAIN}"

echo "==> 2. Creating Node.js Passenger app (Node ${NODE_VERSION}) via cloudlinux-selector"
ssh_run "/usr/sbin/cloudlinux-selector create --json --interpreter nodejs --domain ${DOMAIN} --app-root ${APP_ROOT} --app-uri / --version ${NODE_VERSION} --startup-file dist/index.js"

echo "==> 3. Creating MySQL database ${DB_NAME}"
ssh_run "uapi --output=jsonpretty Mysql create_database name=${DB_NAME}"

echo "==> 4. Creating MySQL user + granting privileges + writing .env"
echo "    (Generates DB password and JWT_SECRET entirely on the remote server —"
echo "     they are never printed here or stored on this machine.)"
ssh -i "$SSH_KEY" -p "$REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout=10 "${REMOTE_USER}@${REMOTE_HOST}" 'bash -s' <<REMOTE_SCRIPT
set -euo pipefail

DB_PASSWORD="\$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9')Aa1!"
JWT_SECRET=\$(openssl rand -base64 48 | tr -d '\\n')

uapi --output=jsonpretty Mysql create_user name=${DB_USER} password="\$DB_PASSWORD"
uapi --output=jsonpretty Mysql set_privileges_on_database user=${DB_USER} database=${DB_NAME} privileges='ALL PRIVILEGES'

cat > ${APP_ROOT}/.env <<ENVEOF
PORT=4000
APP_URL=https://${DOMAIN}
CLIENT_URL=https://${DOMAIN}
DB_HOST=localhost
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=\${DB_PASSWORD}
DB_NAME=${DB_NAME}
JWT_SECRET=\${JWT_SECRET}
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
VISION_LLM_PROVIDER=claude
VISION_LLM_API_KEY=
ENVEOF

chmod 600 ${APP_ROOT}/.env
echo ".env written, chmod 600 confirmed: \$(stat -c '%a' ${APP_ROOT}/.env)"

mysql -u "${DB_USER}" -p"\$DB_PASSWORD" -h localhost -e "SELECT 1 AS connection_test;" "${DB_NAME}"

unset DB_PASSWORD JWT_SECRET
REMOTE_SCRIPT

echo "==> Provisioning complete. .env still needs SMTP_* and VISION_LLM_API_KEY filled in manually before those features work — see docs/superpowers/specs/2026-08-09-cepatkan-bayar-stage-5-deploy-design.md §6."
echo "==> Next: run scripts/deploy.sh to build and upload the app, then push the DB schema (see DEPLOY.md)."
