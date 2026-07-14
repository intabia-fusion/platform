#!/usr/bin/env bash
# Wrapper for `rush fast-build:test`.
# Loads tests/prepare-tests.env, verifies docker test services are up, then runs tests.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/tests/prepare-tests.env"

if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
else
  echo "WARN: ${ENV_FILE} not found; relying on inherited environment."
fi

# Services required by tests: host:port and label.
SERVICES=(
  "localhost:26258 cockroach"
  "localhost:5433 postgres"
  "localhost:9201 elastic"
  "localhost:9000 minio"
  "localhost:19093 redpanda"
)

check_port() {
  local hostport="$1"
  local host="${hostport%%:*}"
  local port="${hostport##*:}"
  if command -v nc >/dev/null 2>&1; then
    nc -z -w 2 "${host}" "${port}" >/dev/null 2>&1
  else
    (exec 3<>"/dev/tcp/${host}/${port}") >/dev/null 2>&1
  fi
}

missing=0
for entry in "${SERVICES[@]}"; do
  hostport="${entry%% *}"
  label="${entry##* }"
  if check_port "${hostport}"; then
    echo "ok   ${label} (${hostport})"
  else
    echo "FAIL ${label} (${hostport}) not reachable"
    missing=1
  fi
done

if [ "${missing}" -ne 0 ]; then
  echo ""
  echo "Test services not up. Start them first:"
  echo "  cd tests && ./prepare-tests.sh"
  exit 1
fi

exec node "${REPO_ROOT}/foundations/utils/packages/platform-rig/bin/compile_all.js" . --parallel --test "$@"
