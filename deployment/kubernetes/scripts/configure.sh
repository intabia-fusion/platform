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
# Configure where the stand scripts deploy: a local k3d cluster or a remote
# Kubernetes. The choice is saved to deployment/kubernetes/.stand/config
# (mode 600, gitignored) and picked up by deploy/down/base scripts on every
# run; explicit env/CLI values always override the saved file.
#
#   configure.sh [--runtime k3d|existing] [--kubeconfig <path|https-url>]
#                [--context <name>] [--namespace <ns>]
#                [--push-images|--no-push-images]
#                [--yes] [--skip-connectivity] [--config-dir <dir>]
#
# Remote kubeconfig: a local path is used as-is; an https URL is downloaded
# into <config-dir>/kubeconfig (mode 600). http URLs are not accepted.
# Without a TTY (or with --yes) nothing is asked - missing inputs are an error,
# so CI can drive it with flags/env:
#   STAND_RUNTIME, STAND_KUBECONFIG, KUBE_CONTEXT, STAND_NAMESPACE,
#   STAND_PUSH_IMAGES, STAND_CONFIG_DIR, STAND_SKIP_CONNECTIVITY=1.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

log()  { printf '\033[1m>> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  sed -n '16,31p' "$0" | sed 's/^# \{0,1\}//'
}

RUNTIME=""
KUBECONFIG_SRC=""
CONTEXT=""
NAMESPACE=""
PUSH=""
ASSUME_YES=0
SKIP_CONN="${STAND_SKIP_CONNECTIVITY:-0}"
CONFIG_DIR="${STAND_CONFIG_DIR:-$K8S_DIR/.stand}"

while [ $# -gt 0 ]; do
  case "$1" in
    --runtime)        RUNTIME="${2:?--runtime needs a value}"; shift 2 ;;
    --kubeconfig)     KUBECONFIG_SRC="${2:?--kubeconfig needs a value}"; shift 2 ;;
    --context)        CONTEXT="${2:?--context needs a value}"; shift 2 ;;
    --namespace)      NAMESPACE="${2:?--namespace needs a value}"; shift 2 ;;
    --push-images)    PUSH=1; shift ;;
    --no-push-images) PUSH=0; shift ;;
    --yes|-y)         ASSUME_YES=1; shift ;;
    --skip-connectivity) SKIP_CONN=1; shift ;;
    --config-dir)     CONFIG_DIR="${2:?--config-dir needs a value}"; shift 2 ;;
    -h|--help)        usage; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

# env fallbacks (explicit env beats saved config, applied when writing below)
RUNTIME="${RUNTIME:-${STAND_RUNTIME:-}}"
KUBECONFIG_SRC="${KUBECONFIG_SRC:-${STAND_KUBECONFIG:-}}"
CONTEXT="${CONTEXT:-${KUBE_CONTEXT:-}}"
NAMESPACE="${NAMESPACE:-${STAND_NAMESPACE:-}}"
PUSH="${PUSH:-${STAND_PUSH_IMAGES:-}}"

INTERACTIVE=0
if [ -t 0 ] && [ "$ASSUME_YES" != 1 ]; then
  INTERACTIVE=1
fi

prompt() { # prompt <label> [default]
  local label="$1" default="${2:-}" reply
  if [ -n "$default" ]; then
    read -r -p "$label [$default]: " reply </dev/tty || true
  else
    read -r -p "$label: " reply </dev/tty || true
  fi
  printf '%s\n' "${reply:-$default}"
}

# ---------------------------------------------------------------- runtime ----
if [ -z "$RUNTIME" ]; then
  if [ "$INTERACTIVE" != 1 ]; then
    die "missing --runtime (or STAND_RUNTIME) in non-interactive mode"
  fi
  echo "Where should stands deploy?"
  echo "  1) local k3d cluster (bootstrap via pnpm -w stand:base:up)"
  echo "  2) remote Kubernetes (existing kubeconfig/context)"
  case "$(prompt "choose 1/2" 1)" in
    2|remote|existing) RUNTIME=existing ;;
    *) RUNTIME=k3d ;;
  esac
fi
case "$RUNTIME" in
  k3d|existing) ;;
  *) die "unknown --runtime '$RUNTIME' (expected k3d|existing); kind stays env/CLI-only" ;;
esac

# ------------------------------------------------------------- namespace -----
if [ -z "$NAMESPACE" ]; then
  if [ "$INTERACTIVE" = 1 ]; then
    NAMESPACE="$(prompt "namespace for the next stand deploy" fusion-dev)"
  else
    NAMESPACE=fusion-dev
  fi
fi
while ! printf '%s' "$NAMESPACE" | grep -qE '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'; do
  [ "$INTERACTIVE" = 1 ] || die "invalid --namespace '$NAMESPACE' (must be a DNS label)"
  warn "namespace must be a DNS label (lowercase letters, digits, '-')"
  NAMESPACE="$(prompt "namespace for the next stand deploy" "")"
done

# ---------------------------------------------------------- kubeconfig -------
KUBECONFIG_PATH=""
if [ "$RUNTIME" = existing ]; then
  while [ -z "$KUBECONFIG_SRC" ]; do
    [ "$INTERACTIVE" = 1 ] || die "missing --kubeconfig (or STAND_KUBECONFIG) in non-interactive mode"
    KUBECONFIG_SRC="$(prompt "kubeconfig: local path or https URL" "")"
    [ -n "$KUBECONFIG_SRC" ] || warn "kubeconfig is required"
  done
  case "$KUBECONFIG_SRC" in
    http://*)
      die "refusing http:// kubeconfig '$KUBECONFIG_SRC' - use an https URL or a local path" ;;
    https://*)
      mkdir -p "$CONFIG_DIR"
      chmod 700 "$CONFIG_DIR"
      KUBECONFIG_PATH="$CONFIG_DIR/kubeconfig"
      log "downloading kubeconfig into $KUBECONFIG_PATH"
      TMP_DL="$CONFIG_DIR/.kubeconfig.download.$$"
      if ! curl -fsSL --retry 3 -o "$TMP_DL" "$KUBECONFIG_SRC"; then
        rm -f "$TMP_DL"
        die "cannot download kubeconfig from '$KUBECONFIG_SRC'"
      fi
      chmod 600 "$TMP_DL"
      mv -f "$TMP_DL" "$KUBECONFIG_PATH" ;;
    *)
      case "$KUBECONFIG_SRC" in
        /*) KUBECONFIG_PATH="$KUBECONFIG_SRC" ;;
        *)  KUBECONFIG_PATH="$(pwd)/$KUBECONFIG_SRC" ;;
      esac
      [ -f "$KUBECONFIG_PATH" ] || die "kubeconfig file not found: $KUBECONFIG_PATH" ;;
  esac

  kubectl config view --kubeconfig "$KUBECONFIG_PATH" >/dev/null 2>&1 || \
    die "not a valid kubeconfig: $KUBECONFIG_PATH"

  CURRENT_CTX="$(kubectl config current-context --kubeconfig "$KUBECONFIG_PATH" 2>/dev/null || true)"
  if [ -z "$CONTEXT" ]; then
    if [ "$INTERACTIVE" = 1 ]; then
      echo "contexts in $KUBECONFIG_PATH:"
      kubectl config get-contexts --kubeconfig "$KUBECONFIG_PATH" -o name | sed 's/^/  /'
      CONTEXT="$(prompt "context" "$CURRENT_CTX")"
    else
      CONTEXT="$CURRENT_CTX"
    fi
  fi
  [ -n "$CONTEXT" ] || die "no context in $KUBECONFIG_PATH and none given (--context)"
  kubectl config get-contexts --kubeconfig "$KUBECONFIG_PATH" -o name | grep -qx "$CONTEXT" || \
    die "context '$CONTEXT' not found in $KUBECONFIG_PATH"

  if [ "$SKIP_CONN" != 1 ]; then
    log "checking cluster connectivity (context $CONTEXT)"
    if ! kubectl --kubeconfig "$KUBECONFIG_PATH" --context "$CONTEXT" \
         --request-timeout=10s get --raw=/version >/dev/null 2>&1; then
      die "cannot reach the cluster - check the kubeconfig/context, or pass --skip-connectivity"
    fi
  fi
fi

# ------------------------------------------------------------ push images ----
if [ -z "$PUSH" ]; then
  case "$RUNTIME" in
    existing) default_push=0 ;;  # remote images are expected pullable as-is
    *)        default_push=1 ;;
  esac
  if [ "$INTERACTIVE" = 1 ]; then
    case "$(prompt "push stand images from this host? (y/N)" "$([ "$default_push" = 1 ] && echo y || echo N)")" in
      y|Y|yes) PUSH=1 ;;
      *)       PUSH=0 ;;
    esac
  else
    PUSH="$default_push"
  fi
fi

# ----------------------------------------------------------------- write -----
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
CONFIG_FILE="$CONFIG_DIR/config"
{
  echo '# Stand configuration written by pnpm -w stand:configure. Do not commit.'
  printf 'STAND_RUNTIME=%q\n' "$RUNTIME"
  if [ "$RUNTIME" = existing ]; then
    printf 'KUBECONFIG=%q\n' "$KUBECONFIG_PATH"
    printf 'KUBE_CONTEXT=%q\n' "$CONTEXT"
  fi
  printf 'STAND_NAMESPACE=%q\n' "$NAMESPACE"
  printf 'STAND_PUSH_IMAGES=%q\n' "$PUSH"
} > "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"

log "stand configuration saved to $CONFIG_FILE"
echo "  runtime:   $RUNTIME"
if [ "$RUNTIME" = existing ]; then
  echo "  kubeconfig: $KUBECONFIG_PATH"
  echo "  context:   $CONTEXT"
fi
echo "  namespace: $NAMESPACE"
echo "  push:      $PUSH"
echo
log "next: pnpm -w stand:base:up (remote: installs platform-base) && pnpm -w stand:dev:up"
