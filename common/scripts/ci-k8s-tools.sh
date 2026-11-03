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
# CI setup for the Kubernetes test stands: installs pinned k3d/kubectl/helm/mkcert
# into a user-writable tools dir and puts them on PATH. No sudo, nothing is
# written into system trust stores - the mkcert CA is consumed through
# NODE_EXTRA_CA_CERTS by the node processes that need it.
#
#   source common/scripts/ci-k8s-tools.sh
#
# The tools land on PATH two ways:
#   - exported into the current shell - GitLab jobs and the CI shell scripts run
#     in one process, so this is all they need;
#   - appended to $GITHUB_PATH when the variable is set - GitHub composite-action
#     steps are separate processes, and the runner prepends the file's lines to
#     PATH of every following step. The file holds one directory path, no secrets.
set -euo pipefail

ci_k8s_tools_path() { # $1 - tools bin dir
  local bin="$1"
  case ":${PATH}:" in
    *":${bin}:"*) ;;
    *) export PATH="${bin}:${PATH}" ;;
  esac
  if [ -n "${GITHUB_PATH:-}" ] && ! grep -qxF "$bin" "$GITHUB_PATH" 2>/dev/null; then
    printf '%s\n' "$bin" >> "$GITHUB_PATH"
  fi
}

ci_k8s_tools_setup() {
  local os arch stamp
  case "$(uname -s)" in
    Linux)  os=linux ;;
    Darwin) os=darwin ;;
    *) echo "ci-k8s-tools: unsupported OS $(uname -s)" >&2; return 1 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64)  arch=amd64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) echo "ci-k8s-tools: unsupported arch $(uname -m)" >&2; return 1 ;;
  esac

  local k3d_ver="${K3D_VERSION:-v5.9.0}"          # k3d v5.9 line - the k3s image pinned in versions.env matches its default
  local kubectl_ver="${KUBECTL_VERSION:-v1.36.4}" # matches K3S_IMAGE_TAG=v1.36.4-k3s1 in versions.env
  local helm_ver="${HELM_VERSION:-v4.0.0}"        # major pinned as HELM_MAJOR=4 in versions.env
  local mkcert_ver="${MKCERT_VERSION:-v1.4.4}"
  local dir="${CI_K8S_TOOLS_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/foundation-k8s-tools}"
  local bin="$dir/bin"

  stamp="$k3d_ver $kubectl_ver $helm_ver $mkcert_ver $os $arch"
  mkdir -p "$bin"
  if [ -f "$dir/VERSIONS" ] && [ "$(cat "$dir/VERSIONS")" = "$stamp" ]; then
    ci_k8s_tools_path "$bin"
    return 0
  fi

  local fetch_tgz helm_dir
  echo "ci-k8s-tools: installing k3d $k3d_ver, kubectl $kubectl_ver, helm $helm_ver, mkcert $mkcert_ver into $bin"

  curl -fsSL --retry 3 -o "$bin/k3d" "https://github.com/k3d-io/k3d/releases/download/${k3d_ver}/k3d-${os}-${arch}"
  chmod +x "$bin/k3d"

  # kubectl publishes a sha256 sidecar - the only binary with a checksum we verify.
  # macOS ships shasum; some minimal linux images lack it but have sha256sum -c.
  local sha_cmd
  if command -v shasum >/dev/null 2>&1; then
    sha_cmd="shasum -a 256"
  elif command -v sha256sum >/dev/null 2>&1 && sha256sum --help 2>&1 | grep -q -- '-c'; then
    sha_cmd="sha256sum"
  else
    echo "ci-k8s-tools: no sha256 checksum tool found" >&2
    return 1
  fi
  curl -fsSL --retry 3 -o "$bin/kubectl" "https://dl.k8s.io/release/${kubectl_ver}/bin/${os}/${arch}/kubectl"
  curl -fsSL --retry 3 -o "$dir/kubectl.sha256" "https://dl.k8s.io/release/${kubectl_ver}/bin/${os}/${arch}/kubectl.sha256"
  if ! ( cd "$bin" && echo "$(cat "$dir/kubectl.sha256")  kubectl" | $sha_cmd -c >/dev/null ); then
    echo "ci-k8s-tools: kubectl checksum mismatch" >&2
    return 1
  fi
  rm -f "$dir/kubectl.sha256"
  chmod +x "$bin/kubectl"

  fetch_tgz="$dir/helm.tar.gz"
  helm_dir="$dir/${os}-${arch}"
  curl -fsSL --retry 3 -o "$fetch_tgz" "https://get.helm.sh/helm-${helm_ver}-${os}-${arch}.tar.gz"
  tar -xzf "$fetch_tgz" -C "$dir" "${os}-${arch}/helm"
  mv -f "$helm_dir/helm" "$bin/helm"
  rm -rf "$fetch_tgz" "$helm_dir"
  chmod +x "$bin/helm"

  curl -fsSL --retry 3 -o "$bin/mkcert" \
    "https://github.com/FiloSottile/mkcert/releases/download/${mkcert_ver}/mkcert-${mkcert_ver}-${os}-${arch}"
  chmod +x "$bin/mkcert"

  printf '%s\n' "$stamp" > "$dir/VERSIONS"
  ci_k8s_tools_path "$bin"

  # Fail here, not in the middle of a stand prepare, on a broken download.
  k3d version
  kubectl version --client=true
  helm version
  mkcert -version
}

ci_k8s_tools_setup
