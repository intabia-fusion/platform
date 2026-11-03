#!/bin/bash

# LiveKit server for sanity tests.
# Uses tests/livekit-test-config.yaml so ports/keys do not collide with
# the dev stand started via dev/run_livekit.sh.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/livekit-test-config.yaml"
RUN_CONFIG_FILE="$CONFIG_FILE"

if [ -n "${LIVEKIT_WEBHOOK_URL:-}" ] || [ -n "${LIVEKIT_REDIS_ADDRESS+x}" ]; then
    RUN_CONFIG_FILE="$(mktemp -t livekit-test.XXXXXX.yaml)"
    cp "$CONFIG_FILE" "$RUN_CONFIG_FILE"
    trap 'rm -f "$RUN_CONFIG_FILE"' EXIT
    if [ -n "${LIVEKIT_WEBHOOK_URL:-}" ]; then
        sed -E "s#^  urls: .*#  urls: ['$LIVEKIT_WEBHOOK_URL']#" "$CONFIG_FILE" > "$RUN_CONFIG_FILE"
    fi
    if [ -n "${LIVEKIT_REDIS_ADDRESS+x}" ]; then
        if [ -z "$LIVEKIT_REDIS_ADDRESS" ]; then
            awk '/^redis:$/ {skip=1; next} skip && /^$/ {skip=0; next} !skip {print}' \
                "$RUN_CONFIG_FILE" > "$RUN_CONFIG_FILE.tmp"
            mv "$RUN_CONFIG_FILE.tmp" "$RUN_CONFIG_FILE"
        else
            sed -E "s#^  address: .*#  address: $LIVEKIT_REDIS_ADDRESS#" \
                "$RUN_CONFIG_FILE" > "$RUN_CONFIG_FILE.tmp"
            mv "$RUN_CONFIG_FILE.tmp" "$RUN_CONFIG_FILE"
        fi
    fi
fi

echo "[LiveKit-test] Config: $RUN_CONFIG_FILE"
echo "[LiveKit-test] HTTP port: 7890"
echo "[LiveKit-test] RTC TCP/UDP: 7891 / 7892"
echo "[LiveKit-test] Webhook URL: ${LIVEKIT_WEBHOOK_URL:-http://127.0.0.1:8097/_love/webhook}"
echo "[LiveKit-test] API keys: testkey, whtestkey"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "[LiveKit-test] ERROR: Config file not found: $CONFIG_FILE"
    exit 1
fi

if ! command -v livekit-server &> /dev/null; then
    echo "[LiveKit-test] ERROR: livekit-server not installed"
    echo "[LiveKit-test] Install: https://docs.livekit.io/home/self-hosting/local/"
    exit 1
fi

if lsof -Pi :7890 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[LiveKit-test] WARNING: Port 7890 already in use"
fi

livekit-server --config "$RUN_CONFIG_FILE"
