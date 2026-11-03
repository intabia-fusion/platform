#!/bin/bash

# LiveKit development server startup script
# This script starts LiveKit with the development configuration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/livekit-dev-config.yaml"
RUN_CONFIG_FILE="$CONFIG_FILE"
LOG_DIR="$SCRIPT_DIR/.livekit"
LOG_FILE="$LOG_DIR/livekit.log"

if [ -n "${LIVEKIT_WEBHOOK_URL:-}" ] || [ -n "${LIVEKIT_REDIS_ADDRESS+x}" ] || [ -n "${LIVEKIT_API_KEY:-}" ]; then
    RUN_CONFIG_FILE="$(mktemp -t livekit-dev.XXXXXX.yaml)"
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
    if [ -n "${LIVEKIT_API_KEY:-}" ]; then
        : "${LIVEKIT_API_SECRET:?set LIVEKIT_API_SECRET}"
        : "${LIVEKIT_WEBHOOK_API_KEY:?set LIVEKIT_WEBHOOK_API_KEY}"
        : "${LIVEKIT_WEBHOOK_API_SECRET:?set LIVEKIT_WEBHOOK_API_SECRET}"
        awk -v key="$LIVEKIT_API_KEY" -v secret="$LIVEKIT_API_SECRET" \
            -v wkey="$LIVEKIT_WEBHOOK_API_KEY" -v wsecret="$LIVEKIT_WEBHOOK_API_SECRET" \
            '/^keys:/ {print; print "  " key ": " secret; print "  " wkey ": " wsecret; skip=1; next}
             skip && /^[^[:space:]]/ {skip=0}
             !skip {print}' "$RUN_CONFIG_FILE" > "$RUN_CONFIG_FILE.tmp"
        mv "$RUN_CONFIG_FILE.tmp" "$RUN_CONFIG_FILE"
        sed -E "s#^  api_key: .*#  api_key: $LIVEKIT_WEBHOOK_API_KEY#" \
            "$RUN_CONFIG_FILE" > "$RUN_CONFIG_FILE.tmp"
        mv "$RUN_CONFIG_FILE.tmp" "$RUN_CONFIG_FILE"
    fi
fi

echo "[LiveKit] Starting LiveKit server in development mode..."
echo "[LiveKit] Config file: $RUN_CONFIG_FILE"
echo "[LiveKit] Log file: $LOG_FILE"
echo "[LiveKit] Webhook URL: ${LIVEKIT_WEBHOOK_URL:-http://127.0.0.1:8098/webhook}"
echo "[LiveKit] Server port: 7880"
echo "[LiveKit] RTC UDP port: 7882"
echo "[LiveKit] RTC TCP port: 7881"
echo "[LiveKit] API keys: ${LIVEKIT_API_KEY:-devkey, devkey2}"
echo ""

if [ ! -f "$CONFIG_FILE" ]; then
    echo "[LiveKit] ERROR: Config file not found: $CONFIG_FILE"
    exit 1
fi

# Check if livekit-server is installed
if ! command -v livekit-server &> /dev/null; then
    echo "[LiveKit] ERROR: livekit-server command not found"
    echo "[LiveKit] Please install LiveKit server: https://docs.livekit.io/home/self-hosting/local/"
    exit 1
fi

# Check if ports are already in use
if lsof -Pi :7880 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[LiveKit] WARNING: Port 7880 is already in use"
    echo "[LiveKit] Attempting to start anyway..."
fi

mkdir -p "$LOG_DIR"
# Keep the previous run: a slow join is usually diagnosed by comparing it with the
# session before it.
if [ -f "$LOG_FILE" ]; then
    mv -f "$LOG_FILE" "$LOG_FILE.prev"
fi

echo "[LiveKit] Starting server..."
# Log to file and to the terminal. `set -o pipefail` so a livekit crash still fails
# the script through the tee pipe.
set -o pipefail
livekit-server --config "$RUN_CONFIG_FILE" 2>&1 | tee "$LOG_FILE"
