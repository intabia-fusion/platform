#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/empty" "$tmp/saved"
printf 'KUBECONFIG=/tmp/saved-kubeconfig\n' > "$tmp/saved/config"
for runtime in k3d kind; do
  for config in empty saved; do
    (
      export STAND_RUNTIME="$runtime" STAND_CONFIG_DIR="$tmp/$config" KUBECONFIG=/tmp/explicit-kubeconfig
      source "$script_dir/lib.sh"
      [ "$KUBECONFIG" = /tmp/explicit-kubeconfig ]
      source "$script_dir/lib.sh"
      [ "$KUBECONFIG" = /tmp/explicit-kubeconfig ]
    )
  done
  (
    unset KUBECONFIG
    export STAND_RUNTIME="$runtime" STAND_CONFIG_DIR="$tmp/saved"
    source "$script_dir/lib.sh"
    [ -z "${KUBECONFIG+x}" ]
    source "$script_dir/lib.sh"
    [ -z "${KUBECONFIG+x}" ]
  )
done
(
  unset KUBECONFIG
  export STAND_RUNTIME=existing STAND_CONFIG_DIR="$tmp/saved" KUBE_CONTEXT=test
  source "$script_dir/lib.sh"
  [ "$KUBECONFIG" = /tmp/saved-kubeconfig ]
  source "$script_dir/lib.sh"
  [ "$KUBECONFIG" = /tmp/saved-kubeconfig ]
)
echo 'kubeconfig checks passed'
