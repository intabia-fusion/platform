#!/usr/bin/env bash
# Fetch top-N analytics from local stats service.
# Usage: ./stats-analytics.sh [limit] [sort=time|count|avg] [source=all|client|server]

set -e

LIMIT="${1:-100}"
SORT="${2:-time}"
SOURCE="${3:-all}"
STATS_URL="${STATS_URL:-http://localhost:4901}"
SERVER_SECRET="${SERVER_SECRET:-secret}"

b64url () {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

HEADER=$(printf '{"typ":"JWT","alg":"HS256"}' | b64url)
PAYLOAD=$(printf '{"extra":{"admin":"true"},"account":"00000000-0000-0000-0000-000000000000"}' | b64url)
SIG=$(printf '%s.%s' "$HEADER" "$PAYLOAD" \
  | openssl dgst -sha256 -hmac "$SERVER_SECRET" -binary \
  | b64url)
TOKEN="${HEADER}.${PAYLOAD}.${SIG}"

current=$(date +%Y%m%d%H%M%S)
mkdir -p ./profiles
OUT="./profiles/analytics-${current}.json"

curl -sS "${STATS_URL}/api/v1/analytics?limit=${LIMIT}&sort=${SORT}&source=${SOURCE}&token=${TOKEN}" -o "${OUT}"

echo "Saved ${OUT}"
echo
echo "=== Top by ${SORT} (${SOURCE}, limit=${LIMIT}) ==="
jq -r '.entries[] | [.service, .path, .operations, .total, .avg] | @tsv' "${OUT}" | column -t -s $'\t'
