#!/usr/bin/env bash
#
# Copyright © 2026 Intabia Fusion.
#
# Licensed under the Eclipse Public License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License. You may
# obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Run a command with the environment resolved for driving a test stand from the
# host (HTTPS URL of the configured stand + mkcert CA trust):
#
#   with-stand-env.sh <sanity|ws|api> [k3d|kind|existing] <cmd...>
#
# Exported (host-only values already set by the caller win):
#   STAND_URL        https://<stand-host>[:<public-port>]
#   PLATFORM_URI     = STAND_URL (Playwright convention)
#   PLATFORM_URL     = STAND_URL (api tests convention)
#   API_TESTS_URL    = STAND_URL (api tests convention)
#   ACCOUNTS_URL     <STAND_URL>/_account
#   FRONT_URL        = STAND_URL (backup harness convention)
#   STORAGE_CONFIG   datalake|<STAND_URL>/_datalake (backup harness reads it)
#   ACCOUNT_DB_URL   account database over a local port-forward (OTP codes etc.),
#                    postgres://postgres:postgres@localhost:<K8S_PG_PORT>/<stand-db>
#   MAILBOX_KAFKA_BROKER  localhost:<K8S_KAFKA_PORT> for tests that read the
#                    notification topic (Mailbox.ts) - see below
#   K8S_STAND        stand name (dev/test-base k8s layout)
#   STAND_HTTPS_PORT public HTTPS port of the stand
#   NODE_EXTRA_CA_CERTS  mkcert rootCA.pem (Node fetch trusts the stand TLS)
#
# When LOCAL_URL points at a localhost front proxy (the webpack dev-server the
# Playwright suites drive, e.g. http://localhost:8081/_account/), PLATFORM_URI
# and BILLING_URL default to that proxy's origin: the suites make host-side REST
# calls through the playwright `request` fixture, which cannot use the mkcert
# CA, so HTTPS stand URLs fail TLS verification from the host. Callers without
# a front proxy (api tests) get the public stand URL instead.
#
# Kafka has no public listener: Strimzi advertises in-cluster pod DNS
# (my-cluster-combined-0.my-cluster-kafka-brokers...:9092) that the host cannot
# resolve, so a plain port-forward is not enough - Mailbox.ts pins every
# connection to MAILBOX_KAFKA_BROKER via a kafkajs socketFactory when the broker
# is loopback. The forward to service/my-cluster-kafka-bootstrap spawns on
# K8S_KAFKA_PORT (default 19093, same port the compose stand published) and
# lives exactly as long as the wrapped command; STAND_KAFKA_FORWARD=0 disables
# it. A port already answering the Kafka ApiVersions request is reused, so
# nested invocations do not stack forwards.
set -euo pipefail
STAND="${1:?usage: with-stand-env.sh <sanity|ws|api> [runtime] <cmd...>}"
case "$STAND" in
  sanity|ws|api) ;;
  *) echo "usage: with-stand-env.sh <sanity|ws|api> [k3d|kind|existing] <cmd...>" >&2; exit 2 ;;
esac
[ $# -ge 2 ] && case "$2" in k3d|kind|existing) STAND_RUNTIME="$2"; shift ;; esac
shift
[ $# -ge 1 ] || { echo "usage: with-stand-env.sh <sanity|ws|api> [runtime] <cmd...>" >&2; exit 2; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

STAND_HOST="$(stand_host "$STAND")"
STAND_DATA="$(stand_data "$STAND")"
[ -n "$STAND_HOST" ] || die "cannot resolve hostUrl of stand '$STAND' from values"

: "${STAND_HTTPS_PORT:=$(published_https_port)}"
export STAND_HTTPS_PORT
STAND_URL="https://$STAND_HOST"
[ "$STAND_HTTPS_PORT" = 443 ] || STAND_URL="$STAND_URL:$STAND_HTTPS_PORT"
export STAND_URL
# Host-side REST from the Playwright suites must go through the front proxy
# when there is one (playwright `request` cannot verify the stand's mkcert TLS).
FRONT_ORIGIN=""
case "${LOCAL_URL:-}" in
  http://localhost:*/* | http://127.0.0.1:*/*)
    FRONT_HOSTPORT="${LOCAL_URL#http://}"
    FRONT_ORIGIN="http://${FRONT_HOSTPORT%%/*}"
    unset FRONT_HOSTPORT
    ;;
esac
: "${PLATFORM_URI:=${FRONT_ORIGIN:-$STAND_URL}}"
export PLATFORM_URI
: "${PLATFORM_URL:=$STAND_URL}"
export PLATFORM_URL
: "${API_TESTS_URL:=$STAND_URL}"
export API_TESTS_URL
: "${ACCOUNTS_URL:=$STAND_URL/_account}"
export ACCOUNTS_URL
: "${BILLING_URL:=${FRONT_ORIGIN:+$FRONT_ORIGIN/_billing}}"
: "${BILLING_URL:=$STAND_URL/_billing}"
export BILLING_URL
: "${FRONT_URL:=$STAND_URL}"
export FRONT_URL
: "${STORAGE_CONFIG:=datalake|$STAND_URL/_datalake}"
export STORAGE_CONFIG
: "${K8S_STAND:=$STAND}"
export K8S_STAND
if [ -z "${NODE_EXTRA_CA_CERTS:-}" ] && have mkcert; then
  CA_FILE="$(mkcert -CAROOT 2>/dev/null)/rootCA.pem"
  [ -f "$CA_FILE" ] && export NODE_EXTRA_CA_CERTS="$CA_FILE"
fi

# Identify a Postgres server with the SSLRequest handshake: any genuine
# Postgres answers 'S' (ssl on) or 'N' (ssl off) to the 8-byte request.
pg_accepts_connection() {
  local port="$1" resp=""
  { exec 3<>"/dev/tcp/127.0.0.1/$port"; } 2>/dev/null || return 1
  { printf '\x00\x00\x00\x08\x04\xd2\x16\x2f' >&3; IFS= read -r -n 1 -t 3 resp <&3; } 2>/dev/null || true
  exec 3>&- 3<&-
  [ "$resp" = "S" ] || [ "$resp" = "N" ]
}

cleanup_pids=()
PF_PID=""
if [ "${STAND_DB_FORWARD:-1}" != 0 ]; then
  : "${K8S_PG_PORT:=65432}"
  export K8S_PG_PORT
  if pg_accepts_connection "$K8S_PG_PORT"; then
    warn "K8S_PG_PORT $K8S_PG_PORT is already serving Postgres; reusing it (set K8S_PG_PORT to use a different port)"
  else
    if (exec 3<>"/dev/tcp/127.0.0.1/$K8S_PG_PORT") 2>/dev/null; then
      die "port $K8S_PG_PORT is already taken by a non-Postgres process; it is not this stand's port-forward. Free the port or set K8S_PG_PORT to another value"
    fi
    # kubectl itself must be the backgrounded process (not the kc function wrapper):
    # the EXIT trap kills $!, and killing a wrapper subshell would leave the
    # forward behind.
    kubectl --context "$KUBE_CONTEXT" -n "$BASE_NAMESPACE" port-forward \
      "statefulset/postgres" "$K8S_PG_PORT:5432" >/dev/null 2>&1 &
    PF_PID=$!
    up=0
    for _ in $(seq 1 50); do
      if pg_accepts_connection "$K8S_PG_PORT"; then up=1; break; fi
      sleep 0.2
    done
    [ "$up" = 1 ] || die "postgres port-forward to $BASE_NAMESPACE/postgres:$K8S_PG_PORT did not start"
  fi
  : "${ACCOUNT_DB_URL:=postgres://postgres:postgres@localhost:$K8S_PG_PORT/$STAND_DATA}"
  export ACCOUNT_DB_URL
  cleanup_pids+=("$PF_PID")
fi

# Identify a Kafka broker by the ApiVersions handshake (api_key 18, v4): any
# genuine broker answers with the request's correlation id.
kafka_accepts_connection() {
  node -e '
    const net = require("net")
    const port = Number(process.argv[1])
    const body = Buffer.concat([
      Buffer.from([0x00, 0x12, 0x00, 0x04]), // api_key 18 (ApiVersions), version 4
      Buffer.from([0x00, 0x00, 0x00, 0x01]), // correlation id 1
      Buffer.from([0x06]), Buffer.from("probe"), // compact client id
      Buffer.from([0x00, 0x00]) // header + payload tagged fields
    ])
    const head = Buffer.from([(body.length >> 24) & 255, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255])
    const socket = net.connect(port, "127.0.0.1")
    let data = Buffer.alloc(0)
    const done = (ok) => { socket.destroy(); process.exit(ok ? 0 : 1) }
    socket.setTimeout(2000, () => done(false))
    socket.on("connect", () => socket.write(Buffer.concat([head, body])))
    socket.on("data", (chunk) => {
      data = Buffer.concat([data, chunk])
      if (data.length >= 8) done(data.readInt32BE(4) === 1)
    })
    socket.on("error", () => done(false))
  ' "$1" 2>/dev/null
}

KAFKA_PF_PID=""
if [ "${STAND_KAFKA_FORWARD:-1}" != 0 ]; then
  : "${K8S_KAFKA_PORT:=19093}"
  export K8S_KAFKA_PORT
  if kafka_accepts_connection "$K8S_KAFKA_PORT"; then
    warn "K8S_KAFKA_PORT $K8S_KAFKA_PORT is already serving Kafka; reusing it (set K8S_KAFKA_PORT to use a different port)"
  else
    if (exec 3<>"/dev/tcp/127.0.0.1/$K8S_KAFKA_PORT") 2>/dev/null; then
      exec 3>&- 3<&-
      die "port $K8S_KAFKA_PORT is already taken by a non-Kafka process; free the port or set K8S_KAFKA_PORT to another value"
    fi
    kubectl --context "$KUBE_CONTEXT" -n "$BASE_NAMESPACE" port-forward \
      "service/my-cluster-kafka-bootstrap" "$K8S_KAFKA_PORT:9092" >/dev/null 2>&1 &
    KAFKA_PF_PID=$!
    up=0
    for _ in $(seq 1 50); do
      if kafka_accepts_connection "$K8S_KAFKA_PORT"; then up=1; break; fi
      sleep 0.2
    done
    [ "$up" = 1 ] || die "kafka port-forward to $BASE_NAMESPACE/my-cluster-kafka-bootstrap:$K8S_KAFKA_PORT did not start"
  fi
  : "${MAILBOX_KAFKA_BROKER:=localhost:$K8S_KAFKA_PORT}"
  export MAILBOX_KAFKA_BROKER
  cleanup_pids+=("$KAFKA_PF_PID")
fi

cleanup() {
  local pid
  for pid in "${cleanup_pids[@]:-}"; do
    [ -n "$pid" ] || continue
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

"$@"
rc=$?
trap - EXIT
cleanup
exit $rc
