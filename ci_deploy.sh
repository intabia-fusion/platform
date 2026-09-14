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
const out = [
  'STAND_HOST=' + q(stand.host),
  'STAND_ADDRESS=' + q(stand.address),
  'STAND_DIR=' + q(stand.dir || 'foundation-selfhost'),
  'STAND_SSH_USER=' + q(ssh.user || 'cicd'),
  'STAND_SSH_PORT=' + q(ssh.port || 22),
  'STAND_SSH_KEY=' + q(ssh.key || ''),
  'STAND_SELFHOST_REPO=' + q(selfhost.repo || 'https://github.com/intabia-fusion/platform-selfhost.git'),
  'STAND_SELFHOST_REF=' + q(process.env.CICD_SELFHOST_REF || selfhost.ref || ''),
  // base64 so the file travels as a single shell token, whatever it contains
  'STAND_PLAN_CONFIG_B64=' + q(Buffer.from(stand.planConfig || '', 'utf8').toString('base64'))
]
const args = (setup.args || []).slice()
// setup.sh appends --env values to platform.conf verbatim and that file is later sourced by
// bash, so an unquoted $ or backtick in a value would be expanded away. Quote it here.
for (const [k, v] of Object.entries(setup.env || {})) {
  const value = String(v)
  if (value.includes("'")) {
    console.error("Stand '" + name + "': setup.env." + k + " contains a single quote, which platform.conf cannot carry")
    process.exit(1)
  }
  args.push('--env', k + "='" + value + "'")
}
out.push('STAND_SETUP_ARGS=(' + args.map(q).join(' ') + ')')
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
    printf './setup.sh --silent --host %s --version %s --registry %s' \
      "$(shq "$STAND_HOST")" "$(shq "$CICD_ENV_VERSION")" "$(shq "$registry")"
    for arg in "${STAND_SETUP_ARGS[@]}"; do printf ' %s' "$(shq "$arg")"; done
    printf '\n./up.sh --recreate\n'
  else
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
while :; do
  # Ready: running, or a one-shot job that exited cleanly.
  bad=$(docker ps -a --filter "label=com.docker.compose.project=$project" \
        --format '{{.Names}}|{{.Status}}' | awk -F'|' '
          $2 ~ /unhealthy|health: starting/ { print; next }
          $2 ~ /^Up / { next }
          $2 ~ /^Exited \(0\)/ { next }
          { print }')
  [ -z "$bad" ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "Stand '$project' is not up after 7 minutes:" >&2
    printf '%s\n' "$bad" | tr '|' ' ' >&2
    exit 1
  fi
  sleep 10
done
echo "Stand '$project' is up: $(docker ps -q --filter "label=com.docker.compose.project=$project" | wc -l) containers running"
READY
} > deploy.sh

echo "Deploy [$mode] $CICD_ENV_VERSION from $registry to $ENV ($STAND_HOST, $STAND_ADDRESS)"

ssh -o 'StrictHostKeyChecking no' \
  -i "$key_file" "$STAND_SSH_USER@$STAND_ADDRESS" \
  -p "$STAND_SSH_PORT" \
  'bash -s' < ./deploy.sh
