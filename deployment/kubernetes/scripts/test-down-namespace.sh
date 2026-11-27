#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/config"
cat > "$tmp/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
case " $* " in *" delete "*) printf '%s\n' "$*" >> "$CALLS" ;; esac
exit 0
STUB
cat > "$tmp/bin/helm" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CALLS"
STUB
chmod +x "$tmp/bin/kubectl" "$tmp/bin/helm"
export PATH="$tmp/bin:$PATH" STAND_CONFIG_DIR="$tmp/config" CALLS="$tmp/calls" KUBE_CONTEXT=test
printf 'STAND_NAMESPACE=other\n' > "$tmp/config/config"
if "$script_dir/down.sh" dev existing --yes >"$tmp/output" 2>&1; then
  echo 'saved namespace should be rejected' >&2; exit 1
fi
grep -q "namespace 'other' differs from expected 'fusion-dev'" "$tmp/output"
test ! -e "$CALLS"
STAND_NAMESPACE=explicit "$script_dir/down.sh" dev existing --yes >"$tmp/output" 2>&1
grep -q 'delete namespace explicit' "$CALLS"
: > "$CALLS"
printf 'STAND_NAMESPACE=fusion-dev\n' > "$tmp/config/config"
"$script_dir/down.sh" dev existing --yes >"$tmp/output" 2>&1
grep -q 'delete namespace fusion-dev' "$CALLS"
echo 'down namespace checks passed'
