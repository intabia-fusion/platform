#!/usr/bin/env bash
# Offline check of push-images.sh: a stand rendered with a non-default image namespace must push
# each locally built intabiafusion/<svc> to <registry>/<namespace>/<svc>, and --check must only
# look at the local images.
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/config"
export STAND_VERSION=v9.9.9
export STAND_CONFIG_DIR="$tmp/config"
export CALLS="$tmp/docker-calls" HELM_CALLS="$tmp/helm-calls" RENDER="$tmp/render"

# Minimal chart render: the image refs are built from the --set globals exactly as
# platform.containerImage does, the rest of the manifest does not matter to push-images.sh.
cat > "$tmp/bin/helm" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$HELM_CALLS"
registry=""; namespace=""; version=""
for arg in "$@"; do
  case "$arg" in
    global.imageRegistry=*) registry="${arg#*=}" ;;
    global.imageNamespace=*) namespace="${arg#*=}" ;;
    global.version=*) version="${arg#*=}" ;;
  esac
done
: "${namespace:=intabiafusion}" "${version:=latest}"
image() { printf '%s\n' "${registry:+$registry/}$namespace/$1:$version"; }
{
  printf -- '---\nkind: Deployment\nmetadata:\n  name: front-api\nspec:\n  replicas: 1\n'
  printf '    spec:\n      containers:\n      - name: front-api\n        image: "%s"\n' "$(image front-api)"
  printf -- '---\nkind: Job\nmetadata:\n  name: tool\nspec:\n'
  printf '    template:\n      spec:\n        containers:\n        - name: tool\n          image: "%s"\n' "$(image tool)"
  printf -- '---\nkind: Deployment\nmetadata:\n  name: landing\nspec:\n  replicas: 1\n'
  printf '    spec:\n      containers:\n      - name: landing\n        image: "intabiafusion/platform-landing:v0.75.0"\n'
  printf -- '---\nkind: Deployment\nmetadata:\n  name: disabled\nspec:\n  replicas: 0\n'
  printf '    spec:\n      containers:\n      - name: disabled\n        image: "%s"\n' "$(image disabled)"
} | tee "$RENDER"
STUB

cat > "$tmp/bin/docker" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CALLS"
case "$1" in
  image)
    [ "$2" = inspect ] || exit 1
    # Only the locally built images exist, whatever namespace the stand pulls them under.
    [ "$3" = "intabiafusion/front-api:$STAND_VERSION" ] || \
      [ "$3" = "intabiafusion/tool:$STAND_VERSION" ]
    ;;
  *) exit 0 ;;
esac
STUB
chmod +x "$tmp/bin/helm" "$tmp/bin/docker"
export PATH="$tmp/bin:$PATH"

STAND_IMAGE_NAMESPACE=myorg "$script_dir/push-images.sh" sanity k3d >"$tmp/output" 2>&1

grep -q 'myorg/front-api:v9.9.9' "$RENDER"
grep -q 'global.imageNamespace=myorg' "$HELM_CALLS"
grep -qx 'image inspect intabiafusion/front-api:v9.9.9' "$CALLS"
grep -qx 'tag intabiafusion/front-api:v9.9.9 localhost:5111/myorg/front-api:v9.9.9' "$CALLS"
grep -qx 'push localhost:5111/myorg/front-api:v9.9.9' "$CALLS"
grep -qx 'push localhost:5111/myorg/tool:v9.9.9' "$CALLS"
grep -q '>> push localhost:5111/myorg/front-api:v9.9.9' "$tmp/output"
# The old target kept the local namespace and the cluster could not find the image.
! grep -q 'localhost:5111/intabiafusion/' "$CALLS"
# Pinned refs and scaled-to-zero deployments are not local build artifacts.
! grep -q 'platform-landing\|disabled' "$CALLS"

: > "$CALLS"
STAND_IMAGE_NAMESPACE=myorg "$script_dir/push-images.sh" sanity k3d --check >"$tmp/output" 2>&1

grep -qx 'image inspect intabiafusion/front-api:v9.9.9' "$CALLS"
grep -q "all images for 'sanity' are present locally" "$tmp/output"
! grep -qE '^(tag|push) ' "$CALLS"

echo 'push-images checks passed'
