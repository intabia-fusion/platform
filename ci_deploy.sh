#!/bin/bash

set -eo pipefail

# Deploys one stand described in $CICD_STANDS_CONFIG (a GitLab File variable holding YAML
# or JSON - see dev/stands.yaml in fusion-deployment):
#
# stands:
#   dev2:
#     host: platform-dev2.intabia.ru
#     address: 192.168.1.52
#     dir: foundation-selfhost
#     ssh:
#       user: cicd
#       port: 22
#       key: |
#         -----BEGIN OPENSSH PRIVATE KEY-----
#         ...
#     selfhost:
#       repo: https://github.com/intabia-fusion/platform-selfhost.git
#       ref: main
#     planConfig: |
#       <contents of charts/fusion/files/plan-config.yaml>
#     setup:
#       args: ['--ssl', '--ssl-cert', '/etc/letsencrypt/live/host/fullchain.pem', '--use-livekit']
#       env:
#         PAYMENT_PROVIDER: tbank
#         TBANK_TERMINAL_KEY: '...'
#         QA_TOOLS_ENABLED: 'true'
#     seed:
#       password: '1234'
#
# seed is for QA stands only: after a clean deploy it creates user1, user2 and admin (a platform
# admin) with that password and restores tests/sanity-ws as workspace sanity-ws with user1 and
# user2 as owners. Off unless the key is present; password defaults to 1234, what the sanity
# suite logs in with.
#
# QA_TOOLS_ENABLED turns on the selfhost qa profile (/_logs, /_stand/, user qa) in both modes. The
# password is <stand name>qa123 unless QA_TOOLS_PASSWORD is given.
#
# selfhost.ref pins the branch/tag/sha of the deployment scripts on the stand; CICD_SELFHOST_REF
# overrides it for a single run. Empty means the checkout is used as it is.
#
# planConfig replaces plan-config.yaml in the checkout, so stand tiers and limits match the
# stage/prod chart instead of the more generous self-host defaults.
#
# Usage: ./ci_deploy.sh clean|update
# clean  - cleanup.sh + setup.sh + up.sh (wipes configs and volumes)
# update - set-version.sh only (pull + restart on the new version)

mode="$1"
case "$mode" in
  clean | update) ;;
  *) echo "Usage: $0 clean|update" >&2; exit 1 ;;
esac

: "${ENV:?stand name (ENV) is not set}"
: "${CICD_ENV_VERSION:?deploy version (CICD_ENV_VERSION) is not set}"
: "${CICD_STANDS_CONFIG:?stand config (CICD_STANDS_CONFIG) is not set}"

# Type File gives a path, type Variable gives the YAML. Never echo it - it holds ssh keys.
stands_file="$CICD_STANDS_CONFIG"
inline_stands=""
if [ ! -f "$stands_file" ]; then
  if [ "${CICD_STANDS_CONFIG#*stands:}" = "$CICD_STANDS_CONFIG" ]; then
    echo "CICD_STANDS_CONFIG is neither a readable file nor a config with a 'stands:' key" >&2
    exit 1
  fi
  inline_stands=$(mktemp)
  stands_file="$inline_stands"
  printf '%s\n' "$CICD_STANDS_CONFIG" > "$stands_file"
  chmod 600 "$stands_file"
fi

# js-yaml's CLI prints the document as JSON, and it reads plain JSON just as well.
STANDS_JSON=$(npx --yes js-yaml@4 "$stands_file")
export STANDS_JSON

# Node emits single-quoted assignments, so values reach the shell literally.
# Assigned first: a bare eval "$(...)" would swallow a parse failure.
stand_vars=$(node - "$ENV" <<'NODE'
const [, , name] = process.argv
const cfg = JSON.parse(process.env.STANDS_JSON)
const stands = cfg.stands || {}
const stand = stands[name]
if (stand == null) {
  console.error("Stand '" + name + "' is not described in the stand config. Known: " + Object.keys(stands).join(', '))
  process.exit(1)
}
for (const field of ['host', 'address']) {
  if (!stand[field]) {
    console.error("Stand '" + name + "': '" + field + "' is missing")
    process.exit(1)
  }
}
const q = (v) => "'" + String(v).split("'").join("'\\''") + "'"
const ssh = stand.ssh || {}
const setup = stand.setup || {}
const selfhost = stand.selfhost || {}
const seed = stand.seed != null && stand.seed !== false
const setupEnv = Object.assign({}, setup.env)
if (seed) {
  // The account service takes platform admins from this list only, there is no tool command for it.
  const admins = String(setupEnv.PLATFORM_ADMIN_EMAILS || '').split(',').filter((it) => it !== '' && it !== 'admin')
  setupEnv.PLATFORM_ADMIN_EMAILS = admins.concat('admin').join(',')
}
if (String(setupEnv.QA_TOOLS_ENABLED) === 'true' && !setupEnv.QA_TOOLS_PASSWORD) {
  setupEnv.QA_TOOLS_PASSWORD = name + 'qa123'
}
const out = [
  'STAND_HOST=' + q(stand.host),
  'STAND_ADDRESS=' + q(stand.address),
  'STAND_DIR=' + q(stand.dir || 'foundation-selfhost'),
  'STAND_SSH_USER=' + q(ssh.user || 'cicd'),
  'STAND_SSH_PORT=' + q(ssh.port || 22),
  'STAND_SSH_KEY=' + q(ssh.key || ''),
  'STAND_SELFHOST_REPO=' + q(selfhost.repo || 'https://github.com/intabia-fusion/platform-selfhost.git'),
  'STAND_SELFHOST_REF=' + q(process.env.CICD_SELFHOST_REF || selfhost.ref || ''),
  'STAND_WEBHOOK=' + q(setupEnv.WEBHOOK_ENABLED == null ? '' : setupEnv.WEBHOOK_ENABLED),
  'STAND_SEED=' + q(seed ? 'true' : ''),
  'STAND_SEED_PASSWORD=' + q((stand.seed || {}).password || '1234'),
  // base64 so the file travels as a single shell token, whatever it contains
  'STAND_PLAN_CONFIG_B64=' + q(Buffer.from(stand.planConfig || '', 'utf8').toString('base64'))
]
const args = (setup.args || []).slice()
const updateEnv = []
// setup.sh appends --env values to platform.conf verbatim and that file is later sourced by
// bash, so an unquoted $ or backtick in a value would be expanded away. Quote it here.
// Goes out as STAND_WEBHOOK: the shell normalises it and passes its own --env.
delete setupEnv.WEBHOOK_ENABLED
for (const [k, v] of Object.entries(setupEnv)) {
  const value = String(v)
  if (value.includes("'")) {
    console.error("Stand '" + name + "': setup.env." + k + " contains a single quote, which platform.conf cannot carry")
    process.exit(1)
  }
  args.push('--env', k + "='" + value + "'")
  // An update never re-runs setup.sh, so a stand deployed before the QA tools existed gets them here.
  if (k.startsWith('QA_TOOLS_')) updateEnv.push(k + "='" + value + "'")
}
out.push('STAND_SETUP_ARGS=(' + args.map(q).join(' ') + ')')
out.push('STAND_UPDATE_ENV=(' + updateEnv.map(q).join(' ') + ')')
console.log(out.join('\n'))
NODE
)
eval "$stand_vars"

# The key may come from the stand config or, for stands not migrated yet, from the
# environment-scoped CICD_SSH_KEY_FILE variable.
key_file=""
temp_key=""
# deploy.sh carries the stand's setup values, so it does not outlive the job step.
cleanup() {
  [ -n "$temp_key" ] && rm -f "$temp_key"
  [ -n "$inline_stands" ] && rm -f "$inline_stands"
  rm -f deploy.sh
  return 0
}
trap cleanup EXIT

if [ -n "$STAND_SSH_KEY" ]; then
  temp_key=$(mktemp)
  key_file="$temp_key"
  printf '%s\n' "$STAND_SSH_KEY" > "$key_file"
elif [ -n "$CICD_SSH_KEY_FILE" ]; then
  key_file="$CICD_SSH_KEY_FILE"
else
  echo "Stand '$ENV': no ssh key in the stand config and no CICD_SSH_KEY_FILE" >&2
  exit 1
fi
chmod 600 "$key_file"

# Single-quote for the script that runs on the stand.
shq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

# CICD_DEPLOY_REGISTRY is deploy-only: DOCKER_REGISTRY also decides where builds push.
deploy_registry="${CICD_DEPLOY_REGISTRY:-$DOCKER_REGISTRY}"
registry="${deploy_registry:+$deploy_registry/}${DOCKER_NAMESPACE:-intabiafusion}"

repo=$(cd "$(dirname "$0")" && pwd)

# WEBHOOK_ENABLED outlives an update in platform.conf, but not every branch ships the webhook
# images, and set-version.sh dies on a missing one. The checkout decides, the stand config overrides.
webhook="$STAND_WEBHOOK"
if [ -z "$webhook" ] && [ -d "$repo/services/webhook" ]; then
  webhook=true
fi
# Off is the empty string: compose.yml tests it with ${WEBHOOK_ENABLED:+...}, so "false" reads as on.
[ "$webhook" == true ] || webhook=""

{
  printf 'set -eo pipefail\n'
  printf '[ -d %s/.git ] || git clone %s %s\n' \
    "$(shq "$STAND_DIR")" "$(shq "$STAND_SELFHOST_REPO")" "$(shq "$STAND_DIR")"
  printf 'cd %s\n' "$(shq "$STAND_DIR")"
  if [ -n "$STAND_SELFHOST_REF" ]; then
    # Detached checkout takes a branch, a tag and a sha the same way.
    printf 'git fetch --tags --force --prune origin\n'
    printf 'git checkout -f --detach origin/%s 2>/dev/null || git checkout -f --detach %s\n' \
      "$(shq "$STAND_SELFHOST_REF")" "$(shq "$STAND_SELFHOST_REF")"
    printf 'git --no-pager log -1 --format="selfhost %%h %%s"\n'
    printf 'chmod +x *.sh\n'
  fi
  # After the checkout: it would otherwise restore the repo's own plan-config.yaml.
  if [ -n "$STAND_PLAN_CONFIG_B64" ]; then
    # A bind mount whose source is missing makes docker create a directory there, and the
    # redirect below cannot overwrite one.
    printf 'rm -rf plan-config.yaml\n'
    printf 'echo %s | base64 -d > plan-config.yaml\n' "$(shq "$STAND_PLAN_CONFIG_B64")"
    printf 'echo "plan-config.yaml: $(wc -l < plan-config.yaml) lines from the stand config"\n'
  fi
  if [ "$mode" == clean ]; then
    printf './cleanup.sh --configs --volumes -y\n'
    printf './setup.sh --silent --host %s --version %s --registry %s --env %s' \
      "$(shq "$STAND_HOST")" "$(shq "$CICD_ENV_VERSION")" "$(shq "$registry")" \
      "$(shq "WEBHOOK_ENABLED=$webhook")"
    for arg in "${STAND_SETUP_ARGS[@]}"; do printf ' %s' "$(shq "$arg")"; done
    printf '\n./up.sh --recreate\n'
  else
    for kv in "WEBHOOK_ENABLED=$webhook" "${STAND_UPDATE_ENV[@]}"; do
      printf "sed -i '/^%s=/d' config/platform.conf\n" "${kv%%=*}"
      printf 'echo %s >> config/platform.conf\n' "$(shq "$kv")"
    done
    if [ "$webhook" != true ]; then
      # Compose leaves the containers of a profile that is no longer active running on the old image.
      cat <<'DROP'
project=$(grep '^DOCKER_NAME=' config/platform.conf | cut -d= -f2)
for svc in webhook webhook-mock; do
  docker ps -aq --filter "label=com.docker.compose.project=${project:-platform}" \
    --filter "label=com.docker.compose.service=$svc" | xargs -r docker rm -f
done
DROP
    fi
    printf './set-version.sh %s --registry %s --silent\n' \
      "$(shq "$CICD_ENV_VERSION")" "$(shq "$registry")"
    # set-version.sh leaves containers whose image did not change, so one stuck from an earlier
    # deploy survives every update. Recreate everything: images are already pulled by now.
    printf './up.sh --recreate\n'
  fi
  # up.sh and set-version.sh exit 0 whatever the containers do, so check here.
  cat <<'READY'
project=$(grep '^DOCKER_NAME=' config/platform.conf | cut -d= -f2)
project=${project:-platform}
deadline=$(( $(date +%s) + 420 ))
was_clean=""
while :; do
  # Ready: running, or a one-shot job that exited cleanly.
  bad=$(docker ps -a --filter "label=com.docker.compose.project=$project" \
        --format '{{.Names}}|{{.Status}}' | awk -F'|' '
          $2 ~ /unhealthy|health: starting/ { print; next }
          $2 ~ /^Up / { next }
          $2 ~ /^Exited \(0\)/ { next }
          { print }')
  # Two clean passes: a crash-looping container shows up as "Up" between restarts, which is
  # how a broken image slipped past a single check.
  if [ -z "$bad" ]; then
    if [ -n "$was_clean" ]; then
      break
    fi
    was_clean=1
    sleep 20
    continue
  fi
  was_clean=""
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "Stand '$project' is not up after 7 minutes:" >&2
    printf '%s\n' "$bad" | tr '|' ' ' >&2
    exit 1
  fi
  sleep 10
done
echo "Stand '$project' is up: $(docker ps -q --filter "label=com.docker.compose.project=$project" | wc -l) containers running"
READY
  # Clean only: the data survives an update, and create-workspace run twice makes a second workspace.
  if [ "$mode" == clean ] && [ -n "$STAND_SEED" ]; then
    # The dump lives in this repo, the stand has only the selfhost checkout.
    printf 'rm -rf backups/sanity-ws && mkdir -p backups\n'
    printf "base64 -d <<'SANITY_WS' | tar xzf - -C backups\n"
    tar czf - -C "$repo/tests" sanity-ws | base64
    printf 'SANITY_WS\n'
    printf 'seed_password=%s\n' "$(shq "$STAND_SEED_PASSWORD")"
    # Same steps as the sanity stand in dev/test-base/src/stands.ts.
    cat <<'SEED'
# This script is bash's stdin: a child that reads it would swallow the rest.
tool() { ./run-tool.sh "$@" < /dev/null; }
tool create-account admin -p "$seed_password" -f Super -l Admin
tool create-account user1 -p "$seed_password" -f John -l Appleseed
tool create-account user2 -p "$seed_password" -f Kainin -l Dirak
tool create-workspace sanity-ws email:user1
./backup-restore.sh backups/sanity-ws sanity-ws --no-accounts < /dev/null
for user in user1 user2; do
  tool assign-workspace "$user" sanity-ws
  tool set-user-role "$user" sanity-ws OWNER
done
tool configure sanity-ws '--enable=*'
tool set-workspace-plan sanity-ws business
# The tool logs its errors and still exits 0, so prove the result: user1 signs in and opens sanity-ws.
account=$(docker ps -q --filter "label=com.docker.compose.project=$project" \
  --filter "label=com.docker.compose.service=account" | head -1)
docker exec -i -e SEED_PASSWORD="$seed_password" "$account" node - <<'CHECK'
const call = async (method, params, token) => {
  const res = await fetch('http://localhost:3000', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token != null ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ method, params })
  })
  const body = await res.json()
  if (body.error != null || body.result == null) throw new Error(method + ': ' + JSON.stringify(body.error ?? body))
  return body.result
}
call('login', { email: 'user1', password: process.env.SEED_PASSWORD })
  .then(async (info) => await call('selectWorkspace', { workspaceUrl: 'sanity-ws', kind: 'external' }, info.token))
  .then(() => { console.log('Seeded: admin, user1, user2, workspace sanity-ws') })
  .catch((err) => { console.error('Seed check failed - ' + err.message); process.exit(1) })
CHECK
SEED
  fi
} > deploy.sh

echo "Deploy [$mode] $CICD_ENV_VERSION from $registry to $ENV ($STAND_HOST, $STAND_ADDRESS)"

ssh -o 'StrictHostKeyChecking no' \
  -i "$key_file" "$STAND_SSH_USER@$STAND_ADDRESS" \
  -p "$STAND_SSH_PORT" \
  'bash -s' < ./deploy.sh
