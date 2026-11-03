#!/usr/bin/env bash
# Tears down what base-up.sh created - and only that.
#
#   base-down.sh [k3d|kind|existing] [--delete-data]
#
#   k3d      - deletes the k3d cluster and its registry (volumes die with them)
#   kind     - deletes the kind cluster and the kind-registry container
#   existing - refuses to touch the cluster; with --delete-data also drops the
#              platform-base namespace (postgres PVCs and all stand data)
set -euo pipefail
[ $# -ge 1 ] && case "$1" in k3d|kind|existing) STAND_RUNTIME="$1"; shift ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

DELETE_DATA=0
[ "${1:-}" = "--delete-data" ] && DELETE_DATA=1

case "$STAND_RUNTIME" in
  k3d)
    if cluster_exists; then
      log "deleting k3d cluster '$K3D_CLUSTER' (all its volumes are removed too)"
      k3d cluster delete "$K3D_CLUSTER"
    else
      log "k3d cluster '$K3D_CLUSTER' does not exist"
    fi
    if k3d registry list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "k3d-fusion-registry"; then
      log "deleting k3d registry k3d-fusion-registry"
      k3d registry delete k3d-fusion-registry
    fi
    ;;
  kind)
    if cluster_exists; then
      log "deleting kind cluster '$KIND_CLUSTER'"
      kind delete cluster --name "$KIND_CLUSTER"
    else
      log "kind cluster '$KIND_CLUSTER' does not exist"
    fi
    if docker ps -a --format '{{.Names}}' | grep -qx kind-registry; then
      log "removing kind-registry container"
      docker rm -f kind-registry
    fi
    ;;
  existing)
    warn "existing runtime: the cluster itself was not created by these scripts and is left untouched"
    if [ "$DELETE_DATA" = 1 ]; then
      log "deleting namespace $BASE_NAMESPACE (postgres/Kafka/silo/elastic data on PVCs)"
      kc delete namespace "$BASE_NAMESPACE" --wait || true
    else
      echo "to remove only the platform-base installation and its data, re-run: $0 existing --delete-data"
      echo "stands keep their data in $BASE_NAMESPACE until then."
    fi
    ;;
esac
