#!/usr/bin/env bash
# Generate the wildcard TLS material for local stands and load it into the cluster.
#
#   certs/gen.sh <runtime> [stand-namespace ...]
#   runtime: k3d | kind | existing
#
# Idempotent: mkcert files are reused while valid, secrets are recreated only when
# the certificate changed. Creates in the traefik namespace:
#   - secret tls/fusion-local-tls  (wildcard cert for *.fusion.localhost; consumed
#     by the platform-base chart's TLSStore default)
# and in every stand namespace:
#   - secret generic/fusion-local-ca (mkcert rootCA.pem as tls.crt, mounted into
#     platform pods as NODE_EXTRA_CA_CERTS via global.tls.caSecretName)
#
# The CA is local-only and is not installed into the host trust store here.
# Run `mkcert -install` separately to trust it in browsers. Certificates and keys
# never leave this machine.
set -euo pipefail

RUNTIME="${1:-}"
shift || true
STAND_NAMESPACES=("$@")

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$CERT_DIR/out"
STAND_RUNTIME="$RUNTIME"
export STAND_RUNTIME
# shellcheck source=../scripts/lib.sh
source "$CERT_DIR/../scripts/lib.sh"
mkdir -p "$OUT_DIR"

# Regenerate only when missing or older than 30 days.
need_cert=1
if [ -f "$OUT_DIR/fusion.crt" ] && [ -f "$OUT_DIR/fusion.key" ]; then
  if [ "$(find "$OUT_DIR/fusion.crt" -mtime -30 2>/dev/null)" ]; then
    need_cert=0
  fi
fi
if [ "$need_cert" = 1 ]; then
  echo ">> mkcert: issuing wildcard certificate for *.fusion.localhost"
  mkcert -cert-file "$OUT_DIR/fusion.crt" -key-file "$OUT_DIR/fusion.key" \
    fusion.localhost "*.fusion.localhost"
else
  echo ">> mkcert: reusing existing certificate (out/fusion.crt)"
fi

kc get namespace "$TRAEFIK_NS" >/dev/null

kc -n "$TRAEFIK_NS" create secret tls fusion-local-tls \
  --cert="$OUT_DIR/fusion.crt" --key="$OUT_DIR/fusion.key" \
  --dry-run=client -o yaml | kc apply -f -

CA_PEM="$(mkcert -CAROOT)/rootCA.pem"
for ns in "${STAND_NAMESPACES[@]}"; do
  kc create namespace "$ns" --dry-run=client -o yaml | kc apply -f -
  kc -n "$ns" create secret generic fusion-local-ca \
    --from-file=tls.crt="$CA_PEM" \
    --dry-run=client -o yaml | kc apply -f -
  echo ">> CA secret fusion-local-ca ready in namespace $ns"
done

echo ">> TLS ready: secret fusion-local-tls in $TRAEFIK_NS (TLSStore default owns platform-base chart), certificate $(openssl x509 -in "$OUT_DIR/fusion.crt" -noout -subject 2>/dev/null || echo out/fusion.crt)"
