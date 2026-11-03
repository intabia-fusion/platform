#!/usr/bin/env bash
# Remove one stand - only its own namespace. Base, registry, cluster and other
# stands are untouched; the stand's database/bucket/topics stay in platform-base
# PVCs (same as compose down without -v). See README "Удаление стенда" for data wipe.
#
#   down.sh <stand> [k3d|kind|existing] [--yes]
set -euo pipefail
STAND="${1:?usage: down.sh <stand> [runtime] [--yes]}"; shift || true
[ $# -ge 1 ] && case "$1" in k3d|kind|existing) STAND_RUNTIME="$1"; shift ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

ASSUME_YES=0; [ "${1:-}" = "--yes" ] && ASSUME_YES=1

mapfile -t VALUES_FILES < <(stand_values_files "$STAND")
NS="$(stand_namespace "$STAND")"
[ -n "$NS" ] || die "cannot resolve namespace from ${VALUES_FILES[*]}"
RELEASE="fusion-$STAND"

guard_down_namespace "$STAND" "$NS" "$ASSUME_YES"

ensure_cluster

if [ "$ASSUME_YES" != 1 ]; then
  warn "this deletes namespace $NS and release $RELEASE (kubernetes resources only)"
  warn "the stand database/bucket/topics in $BASE_NAMESPACE persist"
  read -r -p "continue? [y/N] " ans
  case "$ans" in y|Y|yes) ;; *) echo "aborted"; exit 1 ;; esac
fi

helmc uninstall "$RELEASE" -n "$NS" 2>/dev/null || true
kc delete namespace "$NS" --wait || true
log "stand '$STAND' removed (namespace $NS; data in $BASE_NAMESPACE kept)"
